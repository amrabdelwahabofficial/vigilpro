import { useState } from "react";
import {
  Bell,
  Check,
  ChevronRight,
  Coffee,
  CreditCard,
  Flag,
  Grid2X2,
  Home,
  Plus,
  ReceiptText,
  ScanLine,
  Settings2,
  Sparkles,
  Sunrise,
  WalletCards,
  X,
} from "lucide-react";

type View = "today" | "flow" | "plan";

type Entry = {
  id: number;
  title: string;
  bucket: string;
  amount: number;
  time: string;
  icon: "coffee" | "home" | "card" | "receipt";
};

const baseEntries: Entry[] = [
  { id: 1, title: "Morning coffee", bucket: "Joy", amount: 4.8, time: "8:42 AM", icon: "coffee" },
  { id: 2, title: "Rent transfer", bucket: "Essentials", amount: 840, time: "Yesterday", icon: "home" },
  { id: 3, title: "Metro pass", bucket: "Essentials", amount: 32, time: "Mon, 6:10 PM", icon: "card" },
];

const bucketData = [
  { name: "Essentials", share: 46, spent: "$872", left: "$1,058", tone: "coral", note: "On pace" },
  { name: "Future you", share: 22, spent: "$286", left: "$1,024", tone: "sage", note: "Ahead by $84" },
  { name: "Joy", share: 14, spent: "$94", left: "$326", tone: "gold", note: "3 good treats left" },
  { name: "Tax reserve", share: 18, spent: "$0", left: "$468", tone: "lavender", note: "Set aside" },
];

const iconFor = (icon: Entry["icon"]) => {
  if (icon === "coffee") return Coffee;
  if (icon === "home") return Home;
  if (icon === "card") return CreditCard;
  return ReceiptText;
};

export default function VigilCompass() {
  const [view, setView] = useState<View>("today");
  const [entries, setEntries] = useState(baseEntries);
  const [showCapture, setShowCapture] = useState(false);
  const [captureMode, setCaptureMode] = useState<"quick" | "scan">("quick");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");

  const addEntry = () => {
    const value = Number(amount.replace(",", "."));
    if (!value || value <= 0) {
      setNotice("Add an amount first — even a small one counts.");
      return;
    }
    setEntries((current) => [
      {
        id: Date.now(),
        title: note.trim() || "Unsorted spending",
        bucket: "Joy",
        amount: value,
        time: "Just now",
        icon: "receipt",
      },
      ...current,
    ]);
    setAmount("");
    setNote("");
    setNotice("Added to today. Your runway has been updated.");
    window.setTimeout(() => setNotice(""), 2600);
  };

  return (
    <main className="vc-shell">
      <style>{`
        .vc-shell {
          --ink: #20222a;
          --muted: #7d7f87;
          --line: #e8e4df;
          --paper: #f7f5f1;
          --card: #fffdfa;
          --coral: #e7564d;
          --coral-soft: #fce8e3;
          --sage: #8fae99;
          --sage-soft: #e6f0e8;
          --gold: #d9a84e;
          --gold-soft: #fbf1d9;
          --lavender: #9a91bf;
          --lavender-soft: #eeecf7;
          min-height: 100vh;
          background: var(--paper);
          color: var(--ink);
          font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          letter-spacing: -0.01em;
          overflow-x: hidden;
        }
        .vc-shell * { box-sizing: border-box; }
        .vc-top { padding: 18px 18px 0; }
        .vc-topbar { display:flex; align-items:center; justify-content:space-between; }
        .vc-wordmark { display:flex; align-items:center; gap:10px; }
        .vc-mark { width:28px; height:28px; border-radius:10px 10px 10px 3px; background:var(--coral); display:grid; place-items:center; color:#fffdfa; transform:rotate(-7deg); }
        .vc-brand { font-weight:800; font-size:15px; letter-spacing:.12em; }
        .vc-subbrand { color:var(--muted); font-size:10px; margin-top:1px; letter-spacing:.02em; }
        .vc-top-actions { display:flex; align-items:center; gap:8px; }
        .vc-icon-btn { border:1px solid var(--line); background:var(--card); color:var(--ink); width:34px; height:34px; border-radius:12px; display:grid; place-items:center; cursor:pointer; transition:transform .18s ease, background .18s ease; }
        .vc-icon-btn:hover { transform:translateY(-1px); background:#fff; }
        .vc-avatar { width:34px; height:34px; border-radius:12px; background:var(--ink); color:#fffdfa; display:grid; place-items:center; font-weight:800; font-size:12px; }
        .vc-greeting { margin:28px 0 18px; }
        .vc-kicker { color:var(--coral); text-transform:uppercase; font-size:10px; font-weight:800; letter-spacing:.16em; }
        .vc-greeting h1 { margin:6px 0 0; font-family:Georgia, "Times New Roman", serif; font-weight:400; font-size:32px; line-height:1.03; letter-spacing:-.05em; }
        .vc-greeting p { color:var(--muted); margin:7px 0 0; font-size:12px; }
        .vc-content { padding:0 18px 105px; }
        .vc-runway { background:var(--ink); color:#fffdfa; border-radius:24px; padding:20px; position:relative; overflow:hidden; }
        .vc-runway:after { content:""; width:170px; height:170px; border:1px solid rgba(255,253,250,.15); border-radius:50%; position:absolute; right:-70px; top:-48px; }
        .vc-runway:before { content:""; width:112px; height:112px; border:1px solid rgba(255,253,250,.15); border-radius:50%; position:absolute; right:-18px; top:-18px; }
        .vc-runway-head { display:flex; align-items:flex-start; justify-content:space-between; position:relative; z-index:1; }
        .vc-runway-label { color:#b8babd; font-size:11px; text-transform:uppercase; letter-spacing:.1em; font-weight:700; }
        .vc-runway h2 { margin:8px 0 0; font-family:Georgia, "Times New Roman", serif; font-size:35px; font-weight:400; letter-spacing:-.05em; }
        .vc-runway h2 span { font-size:18px; color:#b8babd; vertical-align:8px; margin-right:3px; }
        .vc-pulse { display:flex; gap:3px; align-items:flex-end; height:30px; margin-top:4px; }
        .vc-pulse i { display:block; width:4px; border-radius:3px; background:var(--coral); opacity:.9; }
        .vc-pulse i:nth-child(1){height:12px}.vc-pulse i:nth-child(2){height:20px}.vc-pulse i:nth-child(3){height:15px}.vc-pulse i:nth-child(4){height:26px}.vc-pulse i:nth-child(5){height:18px}.vc-pulse i:nth-child(6){height:23px}.vc-pulse i:nth-child(7){height:11px}.vc-pulse i:nth-child(8){height:17px}
        .vc-runway-foot { display:flex; align-items:center; justify-content:space-between; margin-top:20px; position:relative; z-index:1; }
        .vc-runway-foot p { color:#b8babd; font-size:11px; margin:0; }
        .vc-runway-foot strong { color:#fffdfa; font-size:12px; }
        .vc-meter { background:#3a3c43; height:6px; border-radius:9px; margin-top:10px; overflow:hidden; position:relative; z-index:1; }
        .vc-meter span { display:block; width:64%; height:100%; background:var(--coral); border-radius:9px; }
        .vc-runway-note { color:#d9dbd9; font-size:11px; margin:13px 0 0; line-height:1.45; position:relative; z-index:1; max-width:260px; }
        .vc-section-head { display:flex; justify-content:space-between; align-items:center; margin:24px 0 11px; }
        .vc-section-head h3 { margin:0; font-size:14px; font-weight:800; letter-spacing:-.02em; }
        .vc-section-head button { color:var(--coral); border:0; background:none; font-size:11px; font-weight:800; cursor:pointer; padding:0; }
        .vc-focus { display:flex; align-items:center; gap:12px; border:1px solid var(--line); background:var(--card); border-radius:18px; padding:13px 14px; }
        .vc-focus-icon { flex:none; width:35px; height:35px; border-radius:12px; background:var(--coral-soft); color:var(--coral); display:grid; place-items:center; }
        .vc-focus-copy { flex:1; min-width:0; }
        .vc-focus-copy strong { display:block; font-size:12px; }
        .vc-focus-copy span { display:block; color:var(--muted); font-size:11px; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .vc-focus button { flex:none; background:var(--coral); color:#fffdfa; border:0; border-radius:10px; padding:8px 10px; font-size:10px; font-weight:800; cursor:pointer; }
        .vc-timeline { display:flex; flex-direction:column; gap:0; }
        .vc-entry { display:flex; gap:11px; align-items:center; min-height:68px; position:relative; }
        .vc-entry:not(:last-child):before { content:""; width:1px; height:28px; position:absolute; left:17px; top:48px; border-left:1px dashed #d6d1cb; }
        .vc-entry-icon { width:35px; height:35px; border-radius:12px; display:grid; place-items:center; flex:none; color:var(--ink); background:#eeece8; }
        .vc-entry-copy { flex:1; min-width:0; }
        .vc-entry-title { display:block; font-size:12px; font-weight:800; }
        .vc-entry-meta { display:block; color:var(--muted); font-size:10px; margin-top:3px; }
        .vc-entry-amount { font-size:12px; font-weight:800; }
        .vc-entry-amount.income { color:var(--sage); }
        .vc-empty { border:1px dashed #d9d3cd; border-radius:16px; padding:18px; text-align:center; color:var(--muted); font-size:11px; }
        .vc-buckets { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
        .vc-bucket { background:var(--card); border:1px solid var(--line); border-radius:17px; padding:13px; min-height:120px; }
        .vc-bucket-top { display:flex; justify-content:space-between; align-items:center; }
        .vc-bucket-dot { width:9px; height:9px; border-radius:50%; }
        .vc-bucket-share { color:var(--muted); font-size:10px; font-weight:700; }
        .vc-bucket strong { display:block; margin-top:13px; font-size:12px; }
        .vc-bucket-amount { font-family:Georgia, "Times New Roman", serif; font-size:19px; margin-top:3px; }
        .vc-bucket-note { color:var(--muted); font-size:10px; margin-top:4px; }
        .vc-flow-card { background:var(--card); border:1px solid var(--line); border-radius:20px; padding:17px; }
        .vc-flow-total { display:flex; align-items:flex-end; justify-content:space-between; }
        .vc-flow-total small { color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:.12em; font-weight:800; }
        .vc-flow-total strong { display:block; font-family:Georgia, "Times New Roman", serif; font-size:29px; font-weight:400; margin-top:5px; }
        .vc-flow-total span { color:var(--sage); font-size:11px; font-weight:800; padding-bottom:4px; }
        .vc-bars { height:146px; display:flex; align-items:flex-end; gap:10px; padding-top:22px; border-bottom:1px solid var(--line); margin-top:10px; }
        .vc-bar-col { flex:1; height:100%; display:flex; align-items:center; flex-direction:column; justify-content:flex-end; gap:5px; }
        .vc-bar { width:100%; max-width:25px; border-radius:7px 7px 2px 2px; min-height:8px; background:var(--coral); }
        .vc-bar.income { background:var(--sage); }
        .vc-bar-label { color:var(--muted); font-size:9px; }
        .vc-flow-legend { display:flex; gap:13px; margin-top:13px; color:var(--muted); font-size:10px; }
        .vc-flow-legend span { display:flex; align-items:center; gap:5px; }
        .vc-flow-legend i { width:7px; height:7px; border-radius:50%; display:block; }
        .vc-plan-hero { background:var(--coral-soft); border-radius:22px; padding:18px; }
        .vc-plan-hero h2 { font-family:Georgia, "Times New Roman", serif; font-size:25px; font-weight:400; letter-spacing:-.04em; margin:0; }
        .vc-plan-hero p { color:#8e625d; font-size:11px; line-height:1.45; margin:7px 0 0; }
        .vc-plan-row { display:flex; align-items:center; gap:11px; border-bottom:1px solid var(--line); padding:15px 0; }
        .vc-plan-row:last-child { border-bottom:0; }
        .vc-plan-row .vc-bucket-dot { flex:none; }
        .vc-plan-copy { flex:1; }
        .vc-plan-copy strong { display:block; font-size:12px; }
        .vc-plan-copy span { display:block; color:var(--muted); font-size:10px; margin-top:4px; }
        .vc-plan-value { font-size:12px; font-weight:800; }
        .vc-bottom { position:fixed; bottom:0; left:0; right:0; background:rgba(247,245,241,.94); backdrop-filter:blur(14px); border-top:1px solid var(--line); display:flex; justify-content:space-around; padding:10px 10px max(10px, env(safe-area-inset-bottom)); z-index:4; }
        .vc-nav { border:0; background:none; color:var(--muted); display:flex; flex-direction:column; align-items:center; gap:4px; font-size:9px; font-weight:700; cursor:pointer; min-width:58px; }
        .vc-nav.active { color:var(--coral); }
        .vc-nav-plus { width:43px; height:43px; margin-top:-25px; border:5px solid var(--paper); border-radius:15px; background:var(--coral); color:#fffdfa; display:grid; place-items:center; box-shadow:0 5px 16px rgba(231,86,77,.22); cursor:pointer; }
        .vc-capture-backdrop { position:fixed; inset:0; background:rgba(32,34,42,.44); z-index:10; display:flex; align-items:flex-end; }
        .vc-capture { width:100%; background:var(--paper); border-radius:25px 25px 0 0; padding:15px 18px 28px; animation:vc-rise .24s ease-out both; }
        @keyframes vc-rise { from { transform:translateY(24px); opacity:0; } to { transform:translateY(0); opacity:1; } }
        .vc-capture-grab { width:38px; height:4px; background:#d5d0ca; border-radius:99px; margin:0 auto 17px; }
        .vc-capture-head { display:flex; justify-content:space-between; align-items:flex-start; }
        .vc-capture-head h2 { margin:0; font-family:Georgia, "Times New Roman", serif; font-size:24px; font-weight:400; }
        .vc-capture-head p { margin:5px 0 0; color:var(--muted); font-size:11px; }
        .vc-capture-close { border:0; background:var(--card); color:var(--ink); width:30px; height:30px; border-radius:10px; display:grid; place-items:center; cursor:pointer; }
        .vc-mode-switch { display:flex; background:#ece9e5; padding:3px; border-radius:11px; margin:20px 0 14px; }
        .vc-mode-switch button { flex:1; border:0; background:transparent; border-radius:8px; padding:9px; color:var(--muted); font-size:11px; font-weight:800; cursor:pointer; }
        .vc-mode-switch button.active { background:var(--card); color:var(--ink); box-shadow:0 1px 4px rgba(32,34,42,.05); }
        .vc-input-label { display:block; color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:.1em; font-weight:800; margin:13px 0 7px; }
        .vc-amount-input, .vc-note-input { width:100%; border:1px solid var(--line); background:var(--card); border-radius:12px; color:var(--ink); outline:none; font:inherit; }
        .vc-amount-input { padding:12px 13px; font-family:Georgia, "Times New Roman", serif; font-size:23px; }
        .vc-note-input { padding:11px 13px; font-size:12px; }
        .vc-amount-input:focus, .vc-note-input:focus { border-color:var(--coral); }
        .vc-scan-option { display:flex; align-items:center; gap:11px; padding:14px; border:1px dashed #d7cbc5; background:var(--coral-soft); color:#9a5e57; border-radius:13px; font-size:11px; line-height:1.4; }
        .vc-save { width:100%; border:0; border-radius:13px; background:var(--coral); color:#fffdfa; padding:13px; margin-top:18px; font-size:12px; font-weight:800; cursor:pointer; }
        .vc-notice { position:fixed; left:18px; right:18px; bottom:83px; z-index:9; padding:11px 13px; background:var(--ink); color:#fffdfa; border-radius:12px; font-size:11px; text-align:center; box-shadow:0 8px 22px rgba(32,34,42,.16); }
        @media (min-width: 600px) { .vc-shell { max-width:450px; margin:0 auto; min-height:910px; } .vc-bottom { max-width:450px; left:50%; transform:translateX(-50%); } .vc-capture-backdrop { max-width:450px; left:50%; transform:translateX(-50%); } }
      `}</style>

      <header className="vc-top">
        <div className="vc-topbar">
          <div className="vc-wordmark">
            <div className="vc-mark"><Sparkles size={15} strokeWidth={2.7} /></div>
            <div>
              <div className="vc-brand">VIGIL</div>
              <div className="vc-subbrand">your money, in view</div>
            </div>
          </div>
          <div className="vc-top-actions">
            <button className="vc-icon-btn" aria-label="Notifications" onClick={() => setNotice("No new reminders. A quiet win.")}><Bell size={16} strokeWidth={1.8} /></button>
            <div className="vc-avatar" aria-label="Profile">AM</div>
          </div>
        </div>
        <div className="vc-greeting">
          <div className="vc-kicker">Wednesday · 13 March</div>
          <h1>Good morning,<br />Amelia.</h1>
          <p>A little clarity before the day gets loud.</p>
        </div>
      </header>

      <section className="vc-content">
        {view === "today" && (
          <>
            <section className="vc-runway">
              <div className="vc-runway-head">
                <div>
                  <div className="vc-runway-label">Safe to spend · March</div>
                  <h2><span>$</span>1,246</h2>
                </div>
                <div className="vc-pulse" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/></div>
              </div>
              <div className="vc-runway-foot"><p>18 days left in your plan</p><strong>64% remaining</strong></div>
              <div className="vc-meter"><span /></div>
              <p className="vc-runway-note">You are spending slower than last month. Keep that breathing room.</p>
            </section>
            <div className="vc-section-head"><h3>One good decision</h3><button onClick={() => setNotice("Small decisions compound. You have got this.")}>Why this?</button></div>
            <div className="vc-focus">
              <div className="vc-focus-icon"><Flag size={17} /></div>
              <div className="vc-focus-copy"><strong>Keep Essentials under $92 today</strong><span>That keeps your runway on its current course.</span></div>
              <button onClick={() => setNotice("Marked as your focus for today.")}>Focus</button>
            </div>
            <div className="vc-section-head"><h3>Today in your money</h3><button onClick={() => setView("flow")}>See flow <ChevronRight size={12} style={{ verticalAlign: "-2px" }} /></button></div>
            <div className="vc-timeline">
              {entries.slice(0, 3).map((entry) => {
                const EntryIcon = iconFor(entry.icon);
                return <div className="vc-entry" key={entry.id}>
                  <div className="vc-entry-icon"><EntryIcon size={16} strokeWidth={1.8} /></div>
                  <div className="vc-entry-copy"><span className="vc-entry-title">{entry.title}</span><span className="vc-entry-meta">{entry.bucket} · {entry.time}</span></div>
                  <span className="vc-entry-amount">−${entry.amount.toFixed(2)}</span>
                </div>;
              })}
              {entries.length === 0 && <div className="vc-empty">No spending yet. Your first log can be tiny.</div>}
            </div>
            <div className="vc-section-head"><h3>Your four lanes</h3><button onClick={() => setView("plan")}>Tune plan <ChevronRight size={12} style={{ verticalAlign: "-2px" }} /></button></div>
            <div className="vc-buckets">
              {bucketData.map((bucket) => <div className="vc-bucket" key={bucket.name}>
                <div className="vc-bucket-top"><span className="vc-bucket-dot" style={{ background: `var(--${bucket.tone})` }} /><span className="vc-bucket-share">{bucket.share}%</span></div>
                <strong>{bucket.name}</strong><div className="vc-bucket-amount">{bucket.left}</div><div className="vc-bucket-note">{bucket.note}</div>
              </div>)}
            </div>
          </>
        )}

        {view === "flow" && (
          <>
            <div className="vc-section-head" style={{ marginTop: 4 }}><h3>Money flow</h3><button onClick={() => setNotice("Showing March 1–31")}>March 2024 <ChevronRight size={12} style={{ verticalAlign: "-2px" }} /></button></div>
            <div className="vc-flow-card">
              <div className="vc-flow-total"><div><small>Net saved this month</small><strong>$1,482</strong></div><span>+12.6%</span></div>
              <div className="vc-bars" aria-label="Monthly income and spending chart">
                {[["01", 61, 33], ["05", 78, 43], ["09", 56, 28], ["13", 91, 39], ["17", 67, 31], ["21", 78, 46], ["25", 48, 24]].map(([day, income, expense]) => <div className="vc-bar-col" key={String(day)}><div className="vc-bar income" style={{ height: `${Number(income)}%` }} /><div className="vc-bar" style={{ height: `${Number(expense)}%` }} /><span className="vc-bar-label">{day}</span></div>)}
              </div>
              <div className="vc-flow-legend"><span><i style={{ background: "var(--sage)" }} /> Income</span><span><i style={{ background: "var(--coral)" }} /> Outflow</span></div>
            </div>
            <div className="vc-section-head"><h3>Where it moved</h3><button onClick={() => setNotice("Your plan is doing what it should.")}>Read the note</button></div>
            <div className="vc-buckets">
              {bucketData.map((bucket) => <div className="vc-bucket" key={bucket.name}><div className="vc-bucket-top"><span className="vc-bucket-dot" style={{ background: `var(--${bucket.tone})` }} /><span className="vc-bucket-share">{bucket.share}% of plan</span></div><strong>{bucket.name}</strong><div className="vc-bucket-amount">{bucket.spent}</div><div className="vc-bucket-note">{bucket.note}</div></div>)}
            </div>
            <div className="vc-section-head"><h3>Recent movement</h3><button onClick={() => setView("today")}>Today <ChevronRight size={12} style={{ verticalAlign: "-2px" }} /></button></div>
            <div className="vc-timeline">{entries.map((entry) => { const EntryIcon = iconFor(entry.icon); return <div className="vc-entry" key={entry.id}><div className="vc-entry-icon"><EntryIcon size={16} strokeWidth={1.8} /></div><div className="vc-entry-copy"><span className="vc-entry-title">{entry.title}</span><span className="vc-entry-meta">{entry.bucket} · {entry.time}</span></div><span className="vc-entry-amount">−${entry.amount.toFixed(2)}</span></div>; })}</div>
          </>
        )}

        {view === "plan" && (
          <>
            <div className="vc-plan-hero"><h2>Give every dollar a job.</h2><p>Your plan is a set of guardrails, not a test. Adjust it when life changes.</p></div>
            <div className="vc-section-head"><h3>Monthly allocation</h3><button onClick={() => setNotice("Plan editing opens after your next pay day.")}>Edit plan</button></div>
            <div className="vc-flow-card">
              {bucketData.map((bucket) => <div className="vc-plan-row" key={bucket.name}><span className="vc-bucket-dot" style={{ background: `var(--${bucket.tone})` }} /><div className="vc-plan-copy"><strong>{bucket.name}</strong><span>{bucket.share}% of your take-home</span></div><span className="vc-plan-value">${[1058, 1024, 326, 468][bucketData.indexOf(bucket)].toLocaleString()}</span><ChevronRight size={15} color="var(--muted)" /></div>)}
            </div>
            <div className="vc-section-head"><h3>Plan health</h3><button onClick={() => setNotice("This month is trending steady.")}>Details</button></div>
            <div className="vc-focus"><div className="vc-focus-icon" style={{ background: "var(--sage-soft)", color: "var(--sage)" }}><Check size={17} /></div><div className="vc-focus-copy"><strong>Everything has a place</strong><span>Your allocations add up to 100%. Nice and boring.</span></div><span style={{ color: "var(--sage)", fontSize: 11, fontWeight: 800 }}>100%</span></div>
            <div className="vc-section-head"><h3>Make room for more</h3></div>
            <div className="vc-focus"><div className="vc-focus-icon" style={{ background: "var(--gold-soft)", color: "var(--gold)" }}><Sunrise size={17} /></div><div className="vc-focus-copy"><strong>Build a 3-month buffer</strong><span>At this pace, you reach it in 7 months.</span></div><button onClick={() => setNotice("Added buffer to your next review.")}>Add</button></div>
          </>
        )}
      </section>

      {notice && <div className="vc-notice">{notice}</div>}

      <nav className="vc-bottom" aria-label="Main navigation">
        <button className={`vc-nav ${view === "today" ? "active" : ""}`} onClick={() => setView("today")}><Home size={18} strokeWidth={view === "today" ? 2.5 : 1.8} />Today</button>
        <button className={`vc-nav ${view === "flow" ? "active" : ""}`} onClick={() => setView("flow")}><Grid2X2 size={18} strokeWidth={view === "flow" ? 2.5 : 1.8} />Flow</button>
        <button className="vc-nav-plus" onClick={() => { setShowCapture(true); setCaptureMode("quick"); }} aria-label="Log spending"><Plus size={22} /></button>
        <button className={`vc-nav ${view === "plan" ? "active" : ""}`} onClick={() => setView("plan")}><WalletCards size={18} strokeWidth={view === "plan" ? 2.5 : 1.8} />Plan</button>
        <button className="vc-nav" onClick={() => setNotice("Settings are tucked away until you need them.")}><Settings2 size={18} />More</button>
      </nav>

      {showCapture && <div className="vc-capture-backdrop" role="dialog" aria-modal="true" aria-label="Log spending" onClick={(event) => { if (event.target === event.currentTarget) setShowCapture(false); }}>
        <section className="vc-capture">
          <div className="vc-capture-grab" />
          <div className="vc-capture-head"><div><h2>Log a moment.</h2><p>It takes less than a breath.</p></div><button className="vc-capture-close" onClick={() => setShowCapture(false)} aria-label="Close"><X size={17} /></button></div>
          <div className="vc-mode-switch"><button className={captureMode === "quick" ? "active" : ""} onClick={() => setCaptureMode("quick")}><Plus size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />Quick note</button><button className={captureMode === "scan" ? "active" : ""} onClick={() => setCaptureMode("scan")}><ScanLine size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />Scan receipt</button></div>
          {captureMode === "quick" ? <><label className="vc-input-label" htmlFor="vc-amount">Amount</label><input id="vc-amount" className="vc-amount-input" inputMode="decimal" placeholder="$ 0.00" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus /><label className="vc-input-label" htmlFor="vc-note">What was it for?</label><input id="vc-note" className="vc-note-input" placeholder="A small detail helps future you" value={note} onChange={(event) => setNote(event.target.value)} /><button className="vc-save" onClick={addEntry}><Check size={15} style={{ verticalAlign: "-3px", marginRight: 6 }} />Save to today</button></> : <><div className="vc-scan-option"><ScanLine size={20} /><span>Point your camera at a receipt. Vigil will find the amount and suggest a lane for you.</span></div><button className="vc-save" onClick={() => { setCaptureMode("quick"); setNotice("Camera ready — enter the amount if you prefer."); }}><ScanLine size={15} style={{ verticalAlign: "-3px", marginRight: 6 }} />Open camera</button></>}
        </section>
      </div>}
    </main>
  );
}