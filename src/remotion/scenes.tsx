import * as React from "react";
import { interpolate } from "remotion";

import { C, FONT_BODY } from "./tokens";
import { appear, BrandMark, Caption, count, Display, Panel, Pill, Rise, rupees, Scene } from "./ui";

/**
 * Seven scenes, one idea each. Figures match the public tour page so the story
 * is consistent: a salaried person, ₹85,000 a month, a flat-share group.
 * Everything here is made up.
 */

interface SceneProps {
  lead: number;
}

const PAD = 80;

/* ── 1. Hook ───────────────────────────────────────────────────────────── */

export function HookScene({ lead }: SceneProps) {
  const lines = ["Know where", "your money went,", "and who still", "owes you."];
  return (
    <Scene lead={lead} background={C.obsidian}>
      {(f) => (
        <>
          <Rise frame={f} at={0} style={{ position: "absolute", left: PAD, top: 56, display: "flex", alignItems: "center", gap: 14 }}>
            <BrandMark size={44} />
            <Display size={34} color={C.limestone}>Fee-Nance</Display>
          </Rise>
          <div style={{ position: "absolute", left: PAD, top: 138 }}>
            {lines.map((line, i) => (
              <Rise key={line} frame={f} at={8 + i * 14} duration={28} distance={40}>
                <Display size={112} color={i === 3 ? C.ember : C.limestone}>{line}</Display>
              </Rise>
            ))}
          </div>
          <Rise frame={f} at={78} style={{ position: "absolute", left: PAD, bottom: 56 }}>
            <Caption color="#aaa6a0" size={26}>Personal and group finance, in rupees.</Caption>
          </Rise>
        </>
      )}
    </Scene>
  );
}

/* ── 2. Log it ─────────────────────────────────────────────────────────── */

const LOG_ROWS = [
  { title: "BigBasket groceries", sub: "2 Nov · Food", amt: -2340, dot: C.ember },
  { title: "Rent", sub: "1 Nov · Housing · repeats monthly", amt: -22000, dot: C.violet },
  { title: "Monthly salary", sub: "1 Nov · Salary · repeats monthly", amt: 85000, dot: C.good },
  { title: "Netflix", sub: "3 Nov · Entertainment", amt: -649, dot: C.warn },
];

function TxRow({ title, sub, amt, dot, badge }: { title: string; sub: string; amt: number; dot: string; badge?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, height: 66, borderBottom: `1px solid ${C.hair}` }}>
      <div style={{ width: 14, height: 14, borderRadius: "50%", background: dot, flex: "none" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>{title}</div>
        <div style={{ fontSize: 18, color: C.ink2 }}>{sub}</div>
      </div>
      {badge}
      <div style={{ fontSize: 24, fontWeight: 700, color: amt > 0 ? C.good : C.obsidian }}>
        {amt > 0 ? "+" : "−"}{rupees(amt)}
      </div>
    </div>
  );
}

export function LogScene({ lead }: SceneProps) {
  return (
    <Scene lead={lead} background={C.pumice}>
      {(f) => {
        const balance = count(f, 52, 84, 57661, 57481);
        const glow = interpolate(f, [30, 46, 90, 120], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <>
            <div style={{ position: "absolute", left: PAD, top: 0, bottom: 0, width: 440, display: "flex", flexDirection: "column", justifyContent: "center", gap: 22 }}>
              <Rise frame={f} at={0}><Display size={92}>Log it in seconds</Display></Rise>
              <Rise frame={f} at={14}><Caption>Add an expense, even with no signal. The balance keeps up.</Caption></Rise>
            </div>
            <Rise frame={f} at={6} style={{ position: "absolute", left: 600, top: 56, width: 600 }}>
              <Panel style={{ height: 608, padding: "28px 32px" }}>
                <div style={{ fontSize: 18, color: C.ink2 }}>Balance this month</div>
                <Display size={78} color={C.obsidian} style={{ marginBottom: 14 }}>{rupees(balance)}</Display>
                <div
                  style={{
                    opacity: appear(f, 30, 14),
                    transform: `translateY(${(1 - appear(f, 30, 20)) * -24}px)`,
                    borderRadius: 16,
                    outline: `3px solid rgba(252, 80, 0, ${glow})`,
                    background: C.limestone,
                  }}
                >
                  <TxRow title="Chai and samosa" sub={"18 Nov · Food"} amt={-180} dot={C.ember} />
                </div>
                {LOG_ROWS.map((r, i) => (
                  <Rise key={r.title} frame={f} at={14 + i * 7} duration={20} distance={16}>
                    <TxRow {...r} />
                  </Rise>
                ))}
              </Panel>
            </Rise>
          </>
        );
      }}
    </Scene>
  );
}

/* ── 3. Budgets with pace ──────────────────────────────────────────────── */

const BUDGETS = [
  { name: "Food", spent: 5352, limit: 8000, ahead: true },
  { name: "Entertainment", spent: 1293, limit: 2500, ahead: false },
  { name: "Transport", spent: 1180, limit: 2500, ahead: false },
];
const PACE = 18 / 30;

export function BudgetsScene({ lead }: SceneProps) {
  return (
    <Scene lead={lead} background={C.pumice}>
      {(f) => (
        <>
          <div style={{ position: "absolute", left: PAD, top: 0, bottom: 0, width: 440, display: "flex", flexDirection: "column", justifyContent: "center", gap: 22 }}>
            <Rise frame={f} at={0}><Display size={92}>Pace, not just totals</Display></Rise>
            <Rise frame={f} at={14}><Caption>Spending is measured against how much of the month has gone.</Caption></Rise>
          </div>
          <Rise frame={f} at={6} style={{ position: "absolute", left: 600, top: 96, width: 600 }}>
            <Panel style={{ padding: "30px 34px", display: "grid", gap: 30 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Display size={44}>November budgets</Display>
                <Pill bg={C.muted} color={C.obsidian} size={20}>Day 18 of 30</Pill>
              </div>
              {BUDGETS.map((b, i) => {
                const fill = (b.spent / b.limit) * appear(f, 22 + i * 14, 40);
                const color = b.ahead ? C.warn : C.good;
                return (
                  <div key={b.name} style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: 26, fontWeight: 700 }}>{b.name}</span>
                      <span style={{ fontSize: 20, color: C.ink2 }}>{rupees(b.spent)} of {rupees(b.limit)}</span>
                    </div>
                    <div style={{ position: "relative", height: 20, borderRadius: 800, background: C.muted }}>
                      <div style={{ position: "absolute", inset: "0 auto 0 0", width: `${fill * 100}%`, borderRadius: 800, background: color }} />
                      <div style={{ position: "absolute", top: -5, bottom: -5, left: `${PACE * 100}%`, width: 3, background: C.obsidian, opacity: appear(f, 18, 14) }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ opacity: appear(f, 84, 20), transform: `translateY(${(1 - appear(f, 84, 24)) * 14}px)` }}>
                <Pill bg={C.warnBg} color={C.warn} size={22}>Food is ahead of pace: about {rupees(8920)}, {rupees(920)} over</Pill>
              </div>
            </Panel>
          </Rise>
        </>
      )}
    </Scene>
  );
}

/* ── 4. Group split ────────────────────────────────────────────────────── */

const SHARES = [
  { who: "Riya", color: C.ember },
  { who: "Aditi", color: C.violet },
  { who: "Karan", color: C.good },
];

export function GroupsScene({ lead }: SceneProps) {
  return (
    <Scene lead={lead} background={C.pumice}>
      {(f) => {
        const press = interpolate(f, [128, 134, 142], [1, 0.95, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const settled = f >= 146;
        return (
          <>
            <div style={{ position: "absolute", left: PAD, top: 0, bottom: 0, width: 440, display: "flex", flexDirection: "column", justifyContent: "center", gap: 22 }}>
              <Rise frame={f} at={0}><Display size={92}>Split bills to the paisa</Display></Rise>
              <Rise frame={f} at={14}><Caption>Equal, percentage, custom, or item by item with GST.</Caption></Rise>
            </div>
            <div style={{ position: "absolute", left: 600, top: 70, width: 600, display: "grid", gap: 18 }}>
              <Rise frame={f} at={6}>
                <Panel style={{ padding: "24px 30px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 30, fontWeight: 700 }}>Dinner at Social</div>
                    <div style={{ fontSize: 20, color: C.ink2 }}>Hostel Squad &middot; paid by Riya</div>
                  </div>
                  <Display size={72}>{rupees(1800)}</Display>
                </Panel>
              </Rise>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                {SHARES.map((s, i) => (
                  <Rise key={s.who} frame={f} at={40 + i * 10} duration={24} distance={-36}>
                    <div style={{ background: C.limestone, border: `1px solid ${C.hair}`, borderRadius: 28, padding: "20px 22px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22, fontWeight: 700 }}>
                        <span style={{ width: 14, height: 14, borderRadius: "50%", background: s.color }} />
                        {s.who}
                      </div>
                      <Display size={56} style={{ marginTop: 6 }}>{rupees(600)}</Display>
                    </div>
                  </Rise>
                ))}
              </div>
              <Rise frame={f} at={96}>
                <Panel style={{ padding: "22px 30px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 26, fontWeight: 700 }}>Aditi pays Riya {rupees(600)}</div>
                  {settled ? (
                    <Pill bg={C.goodBg} color={C.good} size={22}>Settled</Pill>
                  ) : (
                    <div style={{ transform: `scale(${press})` }}>
                      <Pill bg={C.ember} color={C.obsidian} size={22}>Pay via UPI</Pill>
                    </div>
                  )}
                </Panel>
              </Rise>
            </div>
          </>
        );
      }}
    </Scene>
  );
}

/* ── 5. Insights and forecast ──────────────────────────────────────────── */

const FORECAST = (() => {
  const days = 90;
  const mid: number[] = [];
  let balance = 118000;
  for (let i = 0; i <= days; i += 1) {
    if (i > 0) balance -= 760;
    const dayOfMonth = ((18 + i - 1) % 30) + 1;
    if (dayOfMonth === 1 && i > 0) balance += 85000 - (22000 + 649 + 119 + 299 + 5000);
    if (dayOfMonth === 10 && i > 0) balance -= 1860;
    mid.push(balance);
  }
  const band = (i: number) => Math.sqrt(i) * 2100;
  const lo = Math.min(...mid.map((v, i) => v - band(i)));
  const hi = Math.max(...mid.map((v, i) => v + band(i)));
  const W = 540;
  const H = 250;
  const x = (i: number) => 10 + (i / days) * (W - 20);
  const y = (v: number) => 10 + (1 - (v - lo) / (hi - lo)) * (H - 20);
  const line = mid.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const upper = mid.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v + band(i)).toFixed(1)}`).join(" ");
  const lower = mid
    .map((_, i) => `L${x(days - i).toFixed(1)} ${y(mid[days - i]! - band(days - i)).toFixed(1)}`)
    .join(" ");
  return { W, H, line, area: `${upper} ${lower} Z`, endX: x(days), endY: y(mid[days]!), end: mid[days]! };
})();

export function InsightsScene({ lead }: SceneProps) {
  return (
    <Scene lead={lead} background={C.pumice}>
      {(f) => {
        const draw = appear(f, 30, 60);
        return (
          <>
            <div style={{ position: "absolute", left: PAD, top: 0, bottom: 0, width: 440, display: "flex", flexDirection: "column", justifyContent: "center", gap: 22 }}>
              <Rise frame={f} at={0}><Display size={92}>It notices for you</Display></Rise>
              <Rise frame={f} at={16}>
                <Panel style={{ padding: "18px 22px", display: "grid", gap: 8 }}>
                  <div><Pill bg={C.badBg} color={C.bad} size={18}>Duplicate</Pill></div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>Swiggy {rupees(486)} charged twice on 4 Nov</div>
                </Panel>
              </Rise>
              <Rise frame={f} at={40}>
                <Panel style={{ padding: "18px 22px", display: "grid", gap: 8 }}>
                  <div><Pill bg={C.warnBg} color={C.warn} size={18}>Overlap</Pill></div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>Netflix and Prime Video: {rupees(948)} a month</div>
                </Panel>
              </Rise>
            </div>
            <Rise frame={f} at={6} style={{ position: "absolute", left: 600, top: 150, width: 600 }}>
              <Panel style={{ padding: "26px 30px", display: "grid", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <Display size={44}>90-day cash forecast</Display>
                  <span style={{ fontSize: 18, color: C.ink2 }}>line: expected, band: likely range</span>
                </div>
                <svg viewBox={`0 0 ${FORECAST.W} ${FORECAST.H}`} width="100%" style={{ display: "block" }}>
                  <path d={FORECAST.area} fill={C.violet} opacity={0.16 * appear(f, 50, 40)} />
                  <path
                    d={FORECAST.line}
                    fill="none"
                    stroke={C.ember}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - draw}
                  />
                  <circle cx={FORECAST.endX} cy={FORECAST.endY} r={7} fill={C.ember} opacity={appear(f, 86, 12)} />
                </svg>
                <div style={{ fontSize: 22, color: C.ink2, opacity: appear(f, 90, 16) }}>
                  In 90 days: about <b style={{ color: C.obsidian }}>{rupees(FORECAST.end)}</b>
                </div>
              </Panel>
            </Rise>
          </>
        );
      }}
    </Scene>
  );
}

/* ── 6. Works offline ──────────────────────────────────────────────────── */

function Plane({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
    </svg>
  );
}

export function OfflineScene({ lead }: SceneProps) {
  return (
    <Scene lead={lead} background={C.obsidian}>
      {(f) => {
        const offline = f >= 22 && f < 100;
        const syncing = f >= 100 && f < 122;
        const synced = f >= 122;
        const waiting = f >= 52 && f < 122;
        let pill: React.ReactNode = <Pill bg="#12302a" color="#3fcf9f" size={18}>Online</Pill>;
        if (offline) pill = <Pill bg="#36261a" color="#f0a15c" size={18}>{waiting ? "Offline · 1 waiting to sync" : "Offline"}</Pill>;
        if (syncing) pill = <Pill bg="#182a46" color="#7fb0ff" size={18}>Syncing 1 change&hellip;</Pill>;
        if (synced) pill = <Pill bg="#12302a" color="#3fcf9f" size={18}>Synced 1 change</Pill>;
        const night = { fontSize: 22, color: C.limestone } as const;
        return (
          <>
            <div style={{ position: "absolute", left: PAD, top: 0, bottom: 0, width: 520, display: "flex", flexDirection: "column", justifyContent: "center", gap: 22 }}>
              <Rise frame={f} at={0}><Display size={96} color={C.limestone}>No signal, no problem</Display></Rise>
              <Rise frame={f} at={14}><Caption color="#aaa6a0">Changes wait on your phone, then sync once each, in order, when you are back online.</Caption></Rise>
            </div>
            <Rise frame={f} at={4} distance={50} style={{ position: "absolute", left: 790, top: 40, width: 360, height: 640 }}>
              <div style={{ height: "100%", borderRadius: 52, background: C.night, border: `2px solid ${C.nightLine}`, padding: "28px 24px", color: C.limestone, display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Display size={40} color={C.limestone}>Transactions</Display>
                  <div style={{ opacity: offline ? 1 : 0.35 }}><Plane color={offline ? "#f0a15c" : "#aaa6a0"} /></div>
                </div>
                <div style={{ minHeight: 40 }}>{pill}</div>
                {f >= 52 && (
                  <div style={{ opacity: appear(f, 52, 14), transform: `translateY(${(1 - appear(f, 52, 20)) * -18}px)`, display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: `1px solid ${C.nightLine}` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ ...night, fontWeight: 700 }}>Tea at the station</div>
                      <div style={{ fontSize: 16, color: "#aaa6a0" }}>18 Nov &middot; Transport</div>
                      {!synced && <div style={{ marginTop: 6 }}><Pill bg="#36261a" color="#f0a15c" size={14}>Waiting to sync</Pill></div>}
                    </div>
                    <div style={{ ...night, fontWeight: 700 }}>{"−"}{rupees(40)}</div>
                  </div>
                )}
                {[["BigBasket groceries", 2340], ["Rent", 22000], ["Netflix", 649]].map(([t, a], i) => (
                  <Rise key={String(t)} frame={f} at={16 + i * 6} duration={18} distance={12}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0", borderBottom: `1px solid ${C.nightLine}` }}>
                      <span style={{ ...night, fontWeight: 700 }}>{t}</span>
                      <span style={{ ...night, fontWeight: 700 }}>{"−"}{rupees(a as number)}</span>
                    </div>
                  </Rise>
                ))}
              </div>
            </Rise>
          </>
        );
      }}
    </Scene>
  );
}

/* ── 7. End card ───────────────────────────────────────────────────────── */

export function EndScene({ lead }: SceneProps) {
  return (
    <Scene lead={lead} background={C.ember}>
      {(f) => (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, textAlign: "center" }}>
          <Rise frame={f} at={4} distance={20}><BrandMark size={120} bg={C.obsidian} ink={C.ember} /></Rise>
          <Rise frame={f} at={14}><Display size={190} color={C.obsidian}>Fee-Nance</Display></Rise>
          <Rise frame={f} at={28}><div style={{ fontFamily: FONT_BODY, fontSize: 32, fontWeight: 500, color: C.obsidian }}>One ledger for you and your friends.</div></Rise>
          <Rise frame={f} at={42}><Pill bg={C.obsidian} color={C.limestone} size={30}>Get started</Pill></Rise>
          <Rise frame={f} at={52}><div style={{ fontFamily: FONT_BODY, fontSize: 22, color: C.obsidian, opacity: 0.75 }}>Free to use &middot; Amounts in INR</div></Rise>
        </div>
      )}
    </Scene>
  );
}

