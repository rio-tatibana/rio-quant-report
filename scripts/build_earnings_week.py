"""検証した決算資料を統合し、週次決算ページを生成する（公開操作なし）。"""
import html
import json
import math
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "earnings"


def esc(value):
    return html.escape(str(value), quote=True)


def url(value):
    return esc(value) if value and urlparse(value).scheme in ("https", "http") else ""


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def surprise(metric):
    a, e = metric.get("actual"), metric.get("estimate")
    if metric.get("estimate_basis_verified") is not True or not finite(a) or not finite(e) or e == 0:
        return None
    return (a - e) / abs(e) * 100


def pct(value):
    return f"{value:+.2f}%" if finite(value) else "比較未確認"


def fmt(value):
    return f"{value:,.4f}".rstrip("0").rstrip(".") if finite(value) else "未確認"


def links(items):
    seen = set()
    result = []
    for item in items:
        item = {"url": item, "title": urlparse(item).netloc} if isinstance(item, str) else item
        target = item.get("url")
        if target and target not in seen and url(target):
            seen.add(target)
            result.append(f'<a href="{url(target)}" target="_blank" rel="noopener noreferrer">{esc(item.get("title", "出典"))}</a>')
    return " · ".join(result)


def bullets(values):
    return "<ul>" + "".join(f"<li>{esc(v)}</li>" for v in values) + "</ul>" if values else '<p class="section-note">確認できた資料に記載なし。</p>'


def deviation(metric):
    value = surprise(metric)
    if value is None:
        return '<span class="badge caution">比較未確認</span>'
    tone = "positive" if value >= 0 else "negative"
    label = "上振れ" if value > 0 else "下振れ" if value < 0 else "予想どおり"
    return f'<span class="badge {tone}">{pct(value)} {label}</span>'


def metric_card(title, metric, key):
    unit = "百万" + metric.get("currency", "") if key == "revenue" or metric.get("unit") == "million" else metric.get("currency", "") + "/株"
    return f'''<div class="earn-metric"><h4>{title}</h4><p class="earn-value">{fmt(metric.get('actual'))} <small>{esc(unit)}</small></p>
      <p>市場予想 {fmt(metric.get('estimate'))} {esc(unit)}</p>{deviation(metric)}
      <p class="section-note">{esc(metric.get('basis', '基準未確認'))}</p>
      <p class="earn-sources">{links(metric.get('source_urls', []))}</p></div>'''


def make_card(item):
    ticker = item["ticker"]
    call = item.get("call", {})
    reaction = item.get("reaction", {})
    kpi_rows = []
    for k in item.get("kpis", []):
        kpi_rows.append(f'''<tr><th scope="row">{esc(k.get('name',''))}</th><td>{esc(k.get('actual','未確認'))}</td>
          <td>{esc(k.get('target') or '比較可能な目標を確認できず')}</td><td>{esc(k.get('status','判定保留'))}<br><small>{esc(k.get('note',''))}</small>
          {f'<br><a href="{url(k.get("source_url"))}" target="_blank" rel="noopener noreferrer">出典</a>' if url(k.get('source_url')) else ''}</td></tr>''')
    reaction_value = reaction.get("change_pct")
    reaction_text = pct(reaction_value) if finite(reaction_value) else "変動率未確認"
    call_status = call.get("status", "説明会記録未確認")
    profit_label = item.get("profit_label", "1株当たり利益（EPS）")
    daily = item.get("daily_reaction", {})
    daily_html = ""
    if daily:
        tone = "earn-price-up" if daily["change_pct"] >= 0 else "earn-price-down"
        daily_html = f'''<div class="earn-daily"><h4>決算発表を挟む日次終値の変化</h4>
          <p class="earn-value {tone}">{pct(daily['change_pct'])}</p><p>{daily['pre_date']} 終値 {fmt(daily['pre_close'])} USD → {daily['post_date']} 終値 {fmt(daily['post_close'])} USD</p>
          <p class="section-note">同期間のSPY：{pct(daily['spy_change_pct'])}。配当調整なし。決算以外の市場要因も含みます。</p>
          <p class="earn-sources">{links([{'url':daily['source_url'],'title':'Yahoo Finance 日次株価'}])} · <a href="https://finance.yahoo.com/quote/SPY/history/" target="_blank" rel="noopener noreferrer">SPY 日次株価</a></p></div>'''
    return f'''<details class="card earn-company" id="company-{esc(ticker)}" data-day="{esc(item['date'])}" data-search="{esc(ticker+' '+item['name'])}">
      <summary><span class="earn-ticker">{esc(ticker)}</span><span>{esc(item['name'])}<small>{esc(item.get('period',''))} · 抽出日 {esc(item['date'])}</small></span>
        <span class="earn-summary-badges">売上 {deviation(item['revenue'])} {esc(profit_label)} {deviation(item['eps'])}</span></summary>
      <div class="earn-company-body">
        <p class="section-note">公式発表日：{esc(item.get('release_date') or '未確認')} ／ 説明会日：{esc(item.get('call_date') or '未確認')} ／ 抽出時時価総額：{item['market_cap']/1e9:,.2f} 十億USD</p>
        <div class="earn-metrics">{metric_card('売上高',item['revenue'],'revenue')}{metric_card(profit_label,item['eps'],'eps')}</div>
        <div class="earn-columns"><section><h3>説明会・経営陣の説明</h3><p class="earn-status">{esc(call_status)}</p>{bullets(call.get('summary',[]))}
          <h4>質疑応答の焦点</h4>{bullets(call.get('qa',[]))}<p class="earn-sources">{links(call.get('sources',[]))}</p></section>
          <section><h3>株価の反応と変動要因</h3>{daily_html}<h4>報道・資料で確認する変動要因</h4><p class="earn-value">{esc(reaction_text)}</p><p class="section-note">{esc(reaction.get('window') or '記事の観測期間は未確認')}</p><p>{esc(reaction.get('summary','未確認'))}</p>
          <p class="earn-sources">{links([{'url':reaction.get('source_url'),'title':'株価反応の出典'}])}</p>
          <h4>会社の見通し（ガイダンス）</h4>{bullets(item.get('guidance',[]))}</section></div>
        <h3>KPI：事業の達成状況</h3><p class="section-note">KPIは事業を測る重要指標です。前年からの増減と、事前目標の達成は分けて読みます。</p>
        <div class="table-wrap"><table class="data earn-kpi-table"><thead><tr><th>重要指標</th><th>実績</th><th>事前目標・比較対象</th><th>達成状況・読み方</th></tr></thead><tbody>{''.join(kpi_rows)}</tbody></table></div>
        {f'<div class="earn-notes"><h4>比較・日付についての補足</h4>{bullets(item.get("notes",[]))}</div>' if item.get('notes') else ''}
        <p class="earn-sources">{links(item.get('sources',[]))}</p>
      </div></details>'''


def main():
    raw = json.loads((DATA / "moomoo_2026-11-02_06.json").read_text(encoding="utf-8"))
    research = []
    for name in ("research_mon_tue.json", "research_wed.json", "research_thu_fri.json"):
        research.extend(json.loads((DATA / name).read_text(encoding="utf-8")))
    by_ticker = {x["ticker"]: x for x in research}
    for override in json.loads((DATA / "comparison_overrides.json").read_text(encoding="utf-8")):
        by_ticker[override["ticker"]].update(override)
    by_ticker["BAM"]["profit_label"] = "1株当たり分配可能利益（DE）"
    prices = json.loads((DATA / "prices_2026-11-02.json").read_text(encoding="utf-8"))
    selected = [(d["date"], rank, r) for d in raw["days"] for rank,r in enumerate(d["top5"],1)]
    expected = {r["security"].removeprefix("US.") for _,_,r in selected}
    assert set(by_ticker) == expected and len(research) == 25, "調査対象25社の不足・重複"
    items = []
    for day, rank, seed in selected:
        ticker = seed["security"].removeprefix("US.")
        item = by_ticker[ticker]
        item.update(date=day, rank=rank, market_cap=seed["market_cap"])
        item["daily_reaction"] = prices["items"].get(ticker)
        for key in ("revenue", "eps"):
            assert key in item and item[key].get("currency"), ticker + " " + key
            if item[key].get("estimate_basis_verified"):
                assert finite(item[key].get("actual")) and finite(item[key].get("estimate")), ticker + " 比較値欠損"
            item[key]["surprise_pct"] = surprise(item[key])
        items.append(item)
    updated = datetime.now(timezone(timedelta(hours=9))).isoformat(timespec="seconds")
    report = {"title":"米国株 週間決算レビュー", "start":"2026-11-02", "end":"2026-11-06",
              "updated_at_jst":updated,"market_cap_at_jst":raw["retrieved_at_jst"], "items":items}
    (DATA / "week_2026-11-02.json").write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False)+"\n",encoding="utf-8")
    rows = []
    for item in items:
        rev, eps = item["revenue"], item["eps"]
        rows.append(f'''<tr data-day="{item['date']}" data-search="{esc(item['ticker']+' '+item['name'])}" data-revenue="{surprise(rev) if surprise(rev) is not None else ''}" data-eps="{surprise(eps) if surprise(eps) is not None else ''}">
          <td>{item['date'][5:]}<small>日内{item['rank']}位</small></td><th scope="row"><a href="#company-{item['ticker']}" class="earn-company-link">{item['ticker']}</a><small>{esc(item['name'])}</small></th>
          <td class="num">{fmt(rev.get('actual'))}<small>{esc(rev['currency'])} 百万</small></td><td class="num">{fmt(rev.get('estimate'))}</td><td>{deviation(rev)}</td>
          <td class="num">{fmt(eps.get('actual'))}<small>{esc(eps['currency'])}{' 百万' if eps.get('unit') == 'million' else '/株'}</small></td><td class="num">{fmt(eps.get('estimate'))}</td><td>{deviation(eps)}</td>
          <td class="earn-basis">{esc(item.get('profit_label','EPS'))}<br>{esc(eps.get('basis','未確認'))}</td></tr>''')
    rev_count = sum(surprise(x["revenue"]) is not None for x in items)
    eps_count = sum(surprise(x["eps"]) is not None for x in items)
    days = [("2026-11-0"+str(i+2),label) for i,label in enumerate(("11/2 月","11/3 火","11/4 水","11/5 木","11/6 金"))]
    buttons = '<button type="button" class="active" data-day-filter="all" aria-pressed="true">すべて</button>'+''.join(f'<button type="button" data-day-filter="{d}" aria-pressed="false">{label}</button>' for d,label in days)
    template = (ROOT / "scripts" / "earnings_week_template.html").read_text(encoding="utf-8")
    replacements = {"{{UPDATED}}":esc(updated.replace("T"," ")), "{{BUTTONS}}":buttons,
                    "{{ROWS}}":"\n".join(rows),"{{CARDS}}":"\n".join(map(make_card,items)),
                    "{{REV_COUNT}}":str(rev_count),"{{EPS_COUNT}}":str(eps_count)}
    for marker,value in replacements.items():
        template=template.replace(marker,value)
    assert "{{" not in template, "未置換テンプレート"
    (ROOT / "earnings-week-2026-11-02.html").write_text(template,encoding="utf-8")
    print(f"25社のページを生成。売上比較 {rev_count}/25、利益比較 {eps_count}/25。公開操作なし。")


if __name__ == "__main__":
    main()
