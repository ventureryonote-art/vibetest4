// ─────────────────────────────────────────────────────────
// これは「業務アプリの画面」です。宣伝ページ（LP）ではありません。
//
// 題材: 検査結果が返ってきた患者さんへの、電話連絡の待ちリスト
//   docs/03_spec.md にそって作っています。
//
// 画面の骨格（この形は崩さない）:
//   左メニュー（.side）＋ 上部バー（.topbar）＋ 本体（.content）
//   一覧 / 新規登録 / 設定 の3画面を view で切り替える
//
// ⚠ 氏名・電話番号・検査値は保存しません。患者番号（またはイニシャル）までです。
// ─────────────────────────────────────────────────────────
"use client";

import { useEffect, useMemo, useState } from "react";

// ═══════════════════════════════════════════════════════════
//  画面の型 ── docs/03_spec.md「0. 画面の型」のとおり
// ═══════════════════════════════════════════════════════════

/** 色み。内科なので "sea"（医療・介護・公共） */
const TONE = "sea";

/** 密度。1日10名前後なので "normal" */
const DENSITY = "normal";

/** 画面の型。「まだ電話していない人を、結果が届いた順に片づける」ので "queue" */
const LAYOUT: "queue" | "stage" | "due" = "queue";

/** 数え方。数えるのは電話をかける相手なので「名」 */
const UNIT = "名";

/** 検査の区分 */
const CATEGORIES = ["血液", "尿", "画像", "その他"];

// ═══════════════════════════════════════════════════════════

/** 1件のデータ ＝ 検査結果の連絡待ち1名 */
type Record = {
  id: string;
  patient: string;   // 患者番号（またはイニシャル）※氏名は入れない
  category: string;  // 検査の区分
  note: string;      // ひとこと（連絡の段取り）
  date: string;      // YYYY-MM-DD 結果が届いた日
  missed: boolean;   // 不在でかけ直しになっているか
  done: boolean;     // 連絡できたか
};

type View = "list" | "new" | "settings";
type Filter = "open" | "done" | "all";

const KEY = "clinic-callbacks";
const NAME_KEY = "clinic-appname";

/** 画面の型ごとの言葉。ここを直せば画面じゅうの文言が揃って変わる */
const TEXT = {
  queue: {
    sub: "まだ電話していない方が、結果が届いた順に並びます",
    open: "未連絡", done: "連絡済み",
    toTo: "連絡できた", toBack: "未連絡に戻す",
    dateLabel: "結果が届いた日", catLabel: "検査の区分",
    stat2: "3日以上 待ち",
    headOpen: "未連絡（届いた順）",
  },
  stage: {
    sub: "どの段階で止まっているかが分かります",
    open: "進行中", done: "完了",
    toTo: "完了にする", toBack: "進行中に戻す",
    dateLabel: "受け入れた日", catLabel: "いまの段階",
    stat2: "7日以上 動きなし",
    headOpen: "進行中",
  },
  due: {
    sub: "期限が近い順に並びます",
    open: "未完了", done: "完了",
    toTo: "完了にする", toBack: "未完了に戻す",
    dateLabel: "期限", catLabel: "種別",
    stat2: "期限切れ",
    headOpen: "未完了（期限が近い順）",
  },
}[LAYOUT];

/** n日前の日付。マイナスを渡すとn日後 */
const ago = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const today = () => ago(0);

/** 今日との差。0=今日、-3=3日過ぎている、+2=あと2日 */
const diff = (d: string) =>
  Math.round(
    (new Date(d + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime()) / 86400000
  );

/** 何日待たせているか */
const waiting = (d: string) => Math.max(0, -diff(d));

/**
 * 見本データ。すべて架空の患者番号です。
 * ⚠ 氏名・連絡先・検査値は入れません。
 */
const SAMPLE: Record[] = [
  { id: "s01", patient: "No.10523", category: "画像", note: "次回外来の予約も一緒に取る",          date: ago(0),  missed: false, done: false },
  { id: "s02", patient: "No.10519", category: "血液", note: "日中は勤務中。19時以降なら出られる",   date: ago(1),  missed: false, done: false },
  { id: "s03", patient: "No.10517", category: "尿",   note: "1回目つながらず。夕方にかけ直す",      date: ago(2),  missed: true,  done: false },
  { id: "s04", patient: "No.10511", category: "血液", note: "説明が長くなるので午後の診察の後で",    date: ago(3),  missed: false, done: false },
  { id: "s05", patient: "No.10508", category: "血液", note: "ご家族に伝言済み。折り返し待ち",        date: ago(4),  missed: true,  done: false },
  { id: "s06", patient: "No.10502", category: "その他", note: "再検査の案内が必要。来院日を相談",    date: ago(5),  missed: false, done: false },
  { id: "s07", patient: "No.10496", category: "画像", note: "紹介状の準備ができてから連絡する",      date: ago(6),  missed: false, done: false },
  { id: "s08", patient: "No.10488", category: "尿",   note: "留守番電話にメッセージを残した",        date: ago(8),  missed: true,  done: false },
  { id: "s09", patient: "No.10482", category: "血液", note: "健診の再検査分。番号は受付の控えから",  date: ago(10), missed: false, done: false },
  { id: "s10", patient: "No.10474", category: "血液", note: "本人に説明済み。次回は3か月後",         date: ago(12), missed: false, done: true },
  { id: "s11", patient: "No.10468", category: "画像", note: "総合病院へ紹介。予約日まで案内した",    date: ago(14), missed: false, done: true },
  { id: "s12", patient: "No.10461", category: "尿",   note: "問題なしと伝えた。次回外来まで様子見",  date: ago(16), missed: false, done: true },
  { id: "s13", patient: "No.10455", category: "その他", note: "ご家族が来院された際に直接説明",      date: ago(18), missed: false, done: true },
  { id: "s14", patient: "No.10447", category: "血液", note: "薬の量を調整。処方は次回受診時に",      date: ago(21), missed: false, done: true },
];

/** 一覧をどう束ねるか */
type Group = { key: string; label: string; mark?: "late" | "now"; items: Record[] };

function grouped(list: Record[], filter: Filter): Group[] {
  const head = filter === "open" ? TEXT.headOpen : filter === "done" ? TEXT.done : "すべて";

  if (LAYOUT === "stage" && filter === "open") {
    return CATEGORIES.map((c) => ({
      key: c,
      label: c,
      mark: undefined,
      items: list.filter((i) => i.category === c),
    })).filter((g) => g.items.length > 0);
  }

  if (LAYOUT === "due" && filter === "open") {
    const buckets: Group[] = [
      { key: "late",  label: "期限が過ぎている", mark: "late", items: [] },
      { key: "now",   label: "今日・明日",       mark: "now",  items: [] },
      { key: "week",  label: "今週のうち",                     items: [] },
      { key: "later", label: "それ以降",                       items: [] },
    ];
    list.forEach((i) => {
      const d = diff(i.date);
      if (d < 0) buckets[0].items.push(i);
      else if (d <= 1) buckets[1].items.push(i);
      else if (d <= 7) buckets[2].items.push(i);
      else buckets[3].items.push(i);
    });
    return buckets.filter((b) => b.items.length > 0);
  }

  return [{ key: "all", label: head, items: list }];
}

/** 行の右に出す、待たせている日数のバッジ */
function rowBadge(r: Record): { text: string; kind: "warn" | "danger" } | null {
  if (r.done) return null;
  if (LAYOUT === "due") {
    const d = diff(r.date);
    if (d < 0) return { text: `${-d}日 超過`, kind: "danger" };
    if (d === 0) return { text: "今日", kind: "warn" };
    return null;
  }
  const w = waiting(r.date);
  const limit = LAYOUT === "stage" ? 7 : 3;
  return w >= limit ? { text: `${w}日`, kind: "warn" } : null;
}

export default function Home() {
  const [items, setItems] = useState<Record[]>([]);
  const [appName, setAppName] = useState("検査結果 連絡リスト");
  const [loaded, setLoaded] = useState(false);

  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Record | null>(null);

  const [form, setForm] = useState({ patient: "", category: CATEGORIES[0], note: "", date: today() });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setItems(raw ? (JSON.parse(raw) as Record[]) : SAMPLE);
      const n = localStorage.getItem(NAME_KEY);
      if (n) setAppName(n);
    } catch {
      setItems(SAMPLE);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(KEY, JSON.stringify(items));
    localStorage.setItem(NAME_KEY, appName);
  }, [items, appName, loaded]);

  // 見本データのまま触っていない状態か（1名でも足す・消すと false になる）
  const isSample = items.length === SAMPLE.length && items.every((i) => i.id.startsWith("s"));

  const counts = useMemo(
    () => ({
      open: items.filter((i) => !i.done).length,
      done: items.filter((i) => i.done).length,
      all: items.length,
    }),
    [items]
  );

  /** 2つ目の統計。3日以上待たせている方の数 */
  const attention = useMemo(() => {
    const open = items.filter((i) => !i.done);
    if (LAYOUT === "due") return open.filter((i) => diff(i.date) < 0).length;
    const limit = LAYOUT === "stage" ? 7 : 3;
    return open.filter((i) => waiting(i.date) >= limit).length;
  }, [items]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return items
      .filter((i) => (filter === "all" ? true : filter === "open" ? !i.done : i.done))
      .filter((i) => !k || (i.patient + i.note + i.category).toLowerCase().includes(k))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [items, filter, q]);

  const groups = useMemo(() => grouped(shown, filter), [shown, filter]);

  function resetForm() {
    setForm({ patient: "", category: CATEGORIES[0], note: "", date: today() });
    setEditing(null);
  }

  function save() {
    const patient = form.patient.trim();
    if (!patient) return;
    if (editing) {
      setItems(items.map((i) => (i.id === editing.id ? { ...i, ...form, patient } : i)));
    } else {
      setItems([...items, { id: String(Date.now()), ...form, patient, missed: false, done: false }]);
    }
    resetForm();
    setView("list");
  }

  function startEdit(r: Record) {
    setEditing(r);
    setForm({ patient: r.patient, category: r.category, note: r.note, date: r.date });
    setView("new");
  }

  /** 連絡できた／未連絡に戻す。連絡できたら「不在」の印は消す */
  const toggle = (id: string) =>
    setItems(items.map((i) => (i.id === id ? { ...i, done: !i.done, missed: i.done ? i.missed : false } : i)));

  /** 不在だった／不在を取り消す。一覧からは消さず、印だけ付ける */
  const toggleMissed = (id: string) =>
    setItems(items.map((i) => (i.id === id ? { ...i, missed: !i.missed } : i)));

  const remove = (id: string) => setItems(items.filter((i) => i.id !== id));

  const NAV: { k: View; label: string; count?: number }[] = [
    { k: "list", label: "一覧", count: counts.open },
    { k: "new", label: "新規登録" },
    { k: "settings", label: "設定" },
  ];

  const titles: { [K in View]: [string, string] } = {
    list: ["一覧", TEXT.sub],
    new: [editing ? "編集" : "新規登録", "結果が届いた分を1名ずつ登録します"],
    settings: ["設定", "表示名の変更と、データの初期化"],
  };

  return (
    <div className="shell" data-tone={TONE} data-density={DENSITY}>
      {/* ───────── 左メニュー ───────── */}
      <nav className="side">
        <div className="side-brand">
          <div className="n">{appName}</div>
          <div className="s">この端末に保存</div>
        </div>
        <div className="side-label">メニュー</div>
        <div className="side-nav">
          {NAV.map((n) => (
            <button
              key={n.k}
              className="side-item"
              aria-current={view === n.k ? "page" : undefined}
              onClick={() => { if (n.k !== "new") resetForm(); setView(n.k); }}
            >
              {n.label}
              {typeof n.count === "number" && <span className="c">{n.count}</span>}
            </button>
          ))}
        </div>
        <div className="side-foot">氏名・電話番号・検査値は保存しません</div>
      </nav>

      {/* ───────── 本体 ───────── */}
      <div className="main">
        <header className="topbar">
          <span className="t">{titles[view][0]}</span>
          <span className="d">{titles[view][1]}</span>
          {view === "list" && (
            <span className="right">
              <button className="btn" onClick={() => { resetForm(); setView("new"); }}>新規登録</button>
            </span>
          )}
        </header>

        <div className="content">
          {/* ── 一覧 ── */}
          {view === "list" && (
            <>
              {isSample && (
                <div className="notice">
                  表示中のデータは<b>見本</b>です。そのまま触って試せます。
                  消したいときは、左メニューの<b>設定</b>から。
                </div>
              )}

              <div className="stats">
                <div className="stat"><div className="n accent">{counts.open}</div><div className="l">{TEXT.open}</div></div>
                <div className="stat"><div className="n">{attention}</div><div className="l">{TEXT.stat2}</div></div>
                <div className="stat"><div className="n">{counts.all}</div><div className="l">ぜんぶ</div></div>
              </div>

              <div className="filters">
                <div className="search">
                  <input className="field" value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="患者番号・ひとことで検索" />
                </div>
                <div className="seg">
                  {(["open", "done", "all"] as Filter[]).map((f) => (
                    <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                      {f === "open" ? `${TEXT.open} ${counts.open}`
                        : f === "done" ? `${TEXT.done} ${counts.done}`
                        : `全部 ${counts.all}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="list">
                {shown.length === 0 ? (
                  <>
                    <div className="list-head">
                      {filter === "open" ? TEXT.headOpen : filter === "done" ? TEXT.done : "すべて"}
                      <span className="count">0 {UNIT}</span>
                    </div>
                    <div className="empty">
                      <div className="t">{q ? "見つかりませんでした" : "電話を待っている方はいません"}</div>
                      <div className="d">
                        {q ? "患者番号かひとことの言葉を変えてみてください。"
                          : "結果が届いたら、右上の「新規登録」から追加できます。"}
                      </div>
                    </div>
                  </>
                ) : (
                  groups.map((g) => (
                    <div key={g.key}>
                      <div className={"group-head" + (g.mark ? ` is-${g.mark}` : "")}>
                        {g.mark && <span className="dot" />}
                        {g.label}
                        <span className="count">{g.items.length} {UNIT}</span>
                      </div>
                      {g.items.map((r) => {
                        const b = rowBadge(r);
                        return (
                          <div className="row" key={r.id}>
                            <div className="row-main">
                              <div className="row-title">{r.patient}</div>
                              {r.note && <div className="row-sub">{r.note}</div>}
                            </div>
                            <div className="row-meta">
                              {b && <span className={`badge badge-${b.kind}`}>{b.text}</span>}
                              {!r.done && r.missed && <span className="badge badge-danger">不在</span>}
                              <span className="badge">{r.category}</span>
                              <span className="row-time">{r.date.slice(5).replace("-", "/")}</span>
                              <button className="btn-ghost" onClick={() => startEdit(r)}>編集</button>
                              {!r.done && (
                                <button className="btn-ghost" onClick={() => toggleMissed(r.id)}>
                                  {r.missed ? "不在を消す" : "不在だった"}
                                </button>
                              )}
                              <button className="btn-ghost" onClick={() => toggle(r.id)}>
                                {r.done ? TEXT.toBack : TEXT.toTo}
                              </button>
                              <button className="btn-ghost danger-btn" onClick={() => remove(r.id)}>削除</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
              <p className="note">データはこの端末のブラウザにだけ保存されます。外部には送信されません。</p>
            </>
          )}

          {/* ── 新規登録・編集 ── */}
          {view === "new" && (
            <div className="panel">
              <div className="form-row">
                <label className="label" htmlFor="f-patient">患者番号<span className="req">必須</span></label>
                <input id="f-patient" className="field" value={form.patient}
                  onChange={(e) => setForm({ ...form, patient: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                  placeholder="例：No.10482" />
                <span className="hint">氏名・電話番号は入れません。患者番号かイニシャルまでにします</span>
              </div>

              <div className="form-row">
                <div className="inline">
                  <div>
                    <label className="label" htmlFor="f-cat">{TEXT.catLabel}</label>
                    <select id="f-cat" className="select" value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="f-date">{TEXT.dateLabel}</label>
                    <input id="f-date" className="field" type="date" value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="form-row">
                <label className="label" htmlFor="f-note">ひとこと</label>
                <textarea id="f-note" className="field" value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="つながりやすい時間、伝える段取りなど（検査値は書きません）" />
              </div>

              <div className="form-actions">
                <button className="btn" onClick={save} disabled={!form.patient.trim()}>
                  {editing ? "保存する" : "未連絡の一覧に追加"}
                </button>
                <button className="btn-ghost" onClick={() => { resetForm(); setView("list"); }}>やめる</button>
                <span className="spacer" />
                {editing && (
                  <button className="btn-ghost danger-btn"
                    onClick={() => { remove(editing.id); resetForm(); setView("list"); }}>
                    この1{UNIT}を削除
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── 設定 ── */}
          {view === "settings" && (
            <div className="panel">
              <div className="form-row">
                <label className="label" htmlFor="f-app">画面の表示名</label>
                <input id="f-app" className="field" value={appName}
                  onChange={(e) => setAppName(e.target.value)} />
                <span className="hint">左上に表示されます。変えるとすぐ反映されます</span>
              </div>

              <div className="form-row">
                <label className="label">データ</label>
                <div className="inline">
                  <button className="btn-ghost" onClick={() => setItems(SAMPLE)}>見本データを入れ直す</button>
                  <button className="btn-ghost danger-btn"
                    onClick={() => { if (confirm("全部消します。よろしいですか？")) setItems([]); }}>
                    全部消す
                  </button>
                </div>
                <span className="hint">
                  現在 {counts.all} {UNIT}（{TEXT.open} {counts.open} / {TEXT.done} {counts.done}）
                </span>
              </div>

              <p className="note">
                データはこの端末のブラウザにだけ保存されます。
                別の端末や他の人とは共有されません（共有は第3回で扱います）。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
