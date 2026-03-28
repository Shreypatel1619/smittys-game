import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Trophy,
  Flame,
  Target,
  Clock3,
  Medal,
  TrendingUp,
  Crown,
  Star,
  Users,
} from "lucide-react";

const GOOGLE_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRCVpIe1SLclYRteLHwaK2eCpmoua4rm7oaCIgd5h0MpKynAGZJoVWACexAeSGDMVn0u24Nf4O9Y_F8/pub?gid=1052393092&single=true&output=csv";

const DEFAULT_TARGET = 32;
const DEFAULT_STAGE = "April 1–19 • Stage 1";
const GAME_NAME = "Smitty's Red Hot Sales Showdown";
const VENUE_NAME = "Smitty's at Market Mall";
const STAGE_1_DATES = "April 1 – April 19";
const STAGE_2_DATES = "April 20 – April 26";

const FULL_TIME_SERVERS = [
  "Cat",
  "Delayna",
  "Don",
  "Linda",
  "Lorena",
  "Lori",
  "Nattalee",
  "Sharon",
];

const PART_TIME_SERVERS = [
  "Bennett",
  "Dax",
  "Gilbert",
  "KC",
  "Lindsay",
  "MJ",
  "Natasha",
  "Sanaa",
  "TJ",
];

const Card = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={`rounded-3xl border border-white/60 bg-white/90 shadow-[0_10px_35px_rgba(0,0,0,0.08)] backdrop-blur ${className}`}
  >
    {children}
  </div>
);

const CardContent = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => <div className={className}>{children}</div>;

const CardHeader = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => <div className={className}>{children}</div>;

const CardTitle = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => <div className={className}>{children}</div>;

const Button = ({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
  className?: string;
}) => (
  <button {...props} className={className}>
    {children}
  </button>
);

type CsvRow = Record<string, string>;

type Row = {
  rank: number;
  server: string;
  avg: number;
  status: string;
  shift: string;
  stage: string;
  updated_at?: string;
};

type RankedRow = Row & {
  teamRank: number;
};

type TeamFilter = "Full Time" | "Part Time";
type StageFilter = "Stage 1" | "Stage 2";

function parseCSV(text: string): CsvRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const lines = trimmed.split(/\r?\n/);
  if (!lines.length) return [];

  const parseLine = (line: string) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map((header) => header.toLowerCase());

  return lines
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const values = parseLine(line);
      const row: CsvRow = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] ?? "";
      });
      return row;
    });
}

function safeNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function rankBadge(rank: number) {
  if (rank === 1) return "#1 🥇";
  if (rank === 2) return "#2 🥈";
  if (rank === 3) return "#3 🥉";
  return `#${rank}`;
}

function statusLabel(rank: number) {
  if (rank === 1) return "Top Seller";
  if (rank === 2) return "Strong";
  if (rank === 3) return "Rising";
  if (rank <= 5) return "Close Behind";
  return "Push";
}

function rowGlow(rank: number) {
  if (rank === 1) return "from-yellow-100 to-orange-100 border-yellow-300";
  if (rank === 2) return "from-slate-100 to-slate-50 border-slate-300";
  if (rank === 3) return "from-amber-50 to-yellow-50 border-amber-200";
  if (rank <= 5) return "from-emerald-50 to-white border-emerald-200";
  return "from-white to-white border-slate-200";
}

function buildFallbackRows(): Row[] {
  return [
    ...FULL_TIME_SERVERS.map((server) => ({
      rank: 999,
      server,
      avg: 0,
      status: "",
      shift: "Full Time",
      stage: "Stage 1",
    })),
    ...PART_TIME_SERVERS.map((server) => ({
      rank: 999,
      server,
      avg: 0,
      status: "",
      shift: "Part Time",
      stage: "Stage 1",
    })),
  ];
}

function getStage1TopThree(rows: Row[], team: TeamFilter): Row[] {
  return rows
    .filter((row) => row.stage === "Stage 1" && row.shift === team)
    .sort((a, b) => {
      if (b.avg !== a.avg) return b.avg - a.avg;
      return a.server.localeCompare(b.server);
    })
    .slice(0, 3);
}

export default function BillBoosterLiveScoreboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("Full Time");
  const [stageFilter, setStageFilter] = useState<StageFilter>("Stage 1");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const loadData = async () => {
    if (!GOOGLE_SHEET_CSV_URL || GOOGLE_SHEET_CSV_URL.includes("PASTE_YOUR")) {
      if (!hasLoadedOnce) {
        setRows(buildFallbackRows());
        setLastUpdated("");
      }
      setError("");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch(GOOGLE_SHEET_CSV_URL, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Could not load live data (${response.status})`);
      }

      const text = await response.text();
      const parsed = parseCSV(text)
        .map((row) => ({
          rank: safeNumber(row.rank),
          server: (row.server || "").trim(),
          avg: safeNumber(row.avg),
          status: (row.status || "").trim(),
          shift: (row.shift || "").trim(),
          stage: (row.stage || "Stage 1").trim(),
          updated_at: (row.updated_at || "").trim(),
        }))
        .filter((row) => row.server && row.shift && row.stage);

      if (parsed.length > 0) {
        setRows(parsed);
        setHasLoadedOnce(true);

        const sheetUpdatedAt = parsed.find((row) => row.updated_at)?.updated_at?.trim();
        if (sheetUpdatedAt) {
          setLastUpdated(sheetUpdatedAt);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load live data.");
      if (!hasLoadedOnce) {
        setRows(buildFallbackRows());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = window.setInterval(loadData, 60000);
    return () => window.clearInterval(interval);
  }, [hasLoadedOnce]);

  const stageRows = useMemo(() => {
    return rows.filter((row) => row.stage === stageFilter);
  }, [rows, stageFilter]);

  const teamRows = useMemo<RankedRow[]>(() => {
    if (stageFilter === "Stage 2") {
      const qualified = stageRows
        .filter((row) => row.shift === teamFilter)
        .sort((a, b) => {
          if (b.avg !== a.avg) return b.avg - a.avg;
          return a.server.localeCompare(b.server);
        })
        .slice(0, 3);

      const fallbackQualified =
        qualified.length > 0
          ? qualified
          : getStage1TopThree(rows, teamFilter).map((row) => ({
              ...row,
              avg: 0,
              status: "",
              stage: "Stage 2",
            }));

      return fallbackQualified.map((row, index) => ({
        ...row,
        teamRank: index + 1,
      }));
    }

    const serverList = teamFilter === "Full Time" ? FULL_TIME_SERVERS : PART_TIME_SERVERS;
    const actualRows = stageRows.filter((row) => row.shift === teamFilter);

    const mergedRows: Row[] = serverList.map((serverName) => {
      const existing = actualRows.find((row) => row.server === serverName);
      return (
        existing || {
          rank: 999,
          server: serverName,
          avg: 0,
          status: "",
          shift: teamFilter,
          stage: "Stage 1",
        }
      );
    });

    const sorted = mergedRows.sort((a, b) => {
      if (b.avg !== a.avg) return b.avg - a.avg;
      return a.server.localeCompare(b.server);
    });

    return sorted.map((row, index) => ({
      ...row,
      teamRank: index + 1,
    }));
  }, [rows, stageRows, stageFilter, teamFilter]);

  const filteredRows = teamRows;
  const champion = teamRows[0];

  const stageBannerText =
    stageFilter === "Stage 1"
      ? `${STAGE_1_DATES} • Opening Round • Top 3 from each team qualify`
      : `${STAGE_2_DATES} • Qualified servers battle for the win`;

  const sectionTitle =
    stageFilter === "Stage 2"
      ? `${teamFilter} Qualified Servers`
      : `${teamFilter} Top Performers`;

  const visibleCards = stageFilter === "Stage 2" ? filteredRows : filteredRows.slice(0, 5);

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-rose-50 to-orange-50 px-3 py-4 sm:px-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-red-200 bg-white/80 p-4 shadow-xl backdrop-blur sm:p-5 md:p-6"
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-red-600">
                <span className="text-2xl">🥞</span>
                <Flame className="h-6 w-6" />
                <span className="text-sm font-semibold uppercase tracking-[0.25em]">
                  {GAME_NAME}
                </span>
                <span className="text-2xl">🍳</span>
              </div>

              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl md:text-5xl">
                {VENUE_NAME} Live Leaderboard
              </h1>

              <p className="mt-2 text-sm text-slate-600 sm:text-base md:text-lg">
                {stageFilter === "Stage 1"
                  ? `${DEFAULT_STAGE} • Smart upselling. Bigger bills. Better results. ❤️`
                  : `${STAGE_2_DATES} • Qualified servers battle for the win. 🏆`}
              </p>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
                <Button
                  onClick={() => setStageFilter("Stage 1")}
                  className={`min-h-11 rounded-2xl px-4 py-2 text-sm font-bold transition-all duration-200 ${
                    stageFilter === "Stage 1"
                      ? "bg-slate-900 text-white hover:bg-slate-800"
                      : "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  🥞 Stage 1
                </Button>

                <Button
                  onClick={() => setStageFilter("Stage 2")}
                  className={`min-h-11 rounded-2xl px-4 py-2 text-sm font-bold transition-all duration-200 ${
                    stageFilter === "Stage 2"
                      ? "bg-slate-900 text-white hover:bg-slate-800"
                      : "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  🏆 Stage 2
                </Button>

                <Button
                  onClick={() => setTeamFilter("Full Time")}
                  className={`min-h-11 rounded-2xl px-4 py-2 text-sm font-bold transition-all duration-200 ${
                    teamFilter === "Full Time"
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "border border-red-200 bg-white text-red-700 hover:bg-red-50"
                  }`}
                >
                  <Users className="mr-2 inline h-4 w-4" /> Full Time Team
                </Button>

                <Button
                  onClick={() => setTeamFilter("Part Time")}
                  className={`min-h-11 rounded-2xl px-4 py-2 text-sm font-bold transition-all duration-200 ${
                    teamFilter === "Part Time"
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "border border-red-200 bg-white text-red-700 hover:bg-red-50"
                  }`}
                >
                  <Users className="mr-2 inline h-4 w-4" /> Part Time Team
                </Button>

                <div className="rounded-2xl border border-red-100 bg-white/90 px-4 py-3 text-xs font-semibold text-slate-700 shadow-sm sm:text-sm">
                  Showing: <span className="text-red-700">{teamFilter}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Card className="rounded-2xl border-red-200 bg-red-50/70 shadow-sm">
                <CardContent className="flex items-start gap-3 p-3 sm:items-center sm:p-4">
                  <span className="text-xl">🎯</span>
                  <Target className="h-5 w-5 text-red-600" />
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 sm:text-xs">
                      Today Target
                    </div>
                    <div className="text-lg font-bold text-slate-900 sm:text-xl">
                      ${DEFAULT_TARGET.toFixed(0)}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-red-200 bg-white shadow-sm">
                <CardContent className="flex items-start gap-3 p-3 sm:items-center sm:p-4">
                  <span className="text-xl">⏰</span>
                  <Clock3 className="h-5 w-5 text-red-600" />
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 sm:text-xs">
                      Last Updated
                    </div>
                    <div className="text-xs font-semibold leading-5 text-slate-900 sm:text-sm">
                      {lastUpdated || "Waiting for data update..."}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-red-200 bg-white shadow-sm">
                <CardContent className="flex items-start gap-3 p-3 sm:items-center sm:p-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-wide text-green-700">
                      Live
                    </span>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 sm:text-xs">
                      Servers Ranked
                    </div>
                    <div className="text-lg font-bold text-slate-900 sm:text-xl">
                      {teamRows.length}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="rounded-3xl border border-red-200 bg-gradient-to-r from-red-600 via-rose-600 to-orange-500 text-white shadow-xl">
            <CardContent className="flex flex-col gap-3 p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.3em] text-red-100">
                  Live Stage Banner
                </div>
                <div className="mt-1 text-xl font-black sm:text-2xl">{stageFilter}</div>
                <div className="mt-1 text-xs leading-5 text-red-50 sm:text-sm">
                  {stageBannerText}
                </div>
              </div>
              <div className="rounded-2xl bg-white/15 px-4 py-3 text-sm font-semibold backdrop-blur">
                {teamFilter} view active
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {champion && (
          <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="overflow-hidden rounded-3xl border-2 border-red-300 bg-gradient-to-r from-red-100 via-rose-50 to-orange-100 shadow-xl">
              <CardContent className="flex flex-col gap-4 p-4 sm:p-5 md:p-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <div className="rounded-2xl bg-white/80 p-3 shadow">
                    <Crown className="h-10 w-10 text-red-600" />
                  </div>
                  <div>
                    <div className="text-sm font-bold uppercase tracking-[0.25em] text-red-700">
                      {GAME_NAME} Champion 👑
                    </div>
                    <div className="text-2xl font-black text-slate-900 sm:text-3xl">
                      {champion.server}
                    </div>
                    <div className="text-slate-600">
                      Leading the {teamFilter} challenge at {VENUE_NAME} with the highest live average check.
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-white px-4 py-3 text-center shadow sm:px-6 sm:py-4">
                  <div className="text-xs uppercase tracking-[0.25em] text-slate-500">
                    Avg Check
                  </div>
                  <div className="text-3xl font-black text-red-600 sm:text-4xl">
                    ${safeNumber(champion.avg).toFixed(2)}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <div className="grid gap-6 2xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="rounded-3xl border-orange-200 bg-white/85 shadow-xl">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 px-4 pt-4 lg:flex-row lg:items-center lg:justify-between">
                <CardTitle className="flex items-center gap-2 text-xl font-black sm:text-2xl">
                  <Trophy className="h-6 w-6 text-orange-600" />
                  {sectionTitle}
                </CardTitle>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 p-4">
              {loading && (
                <div className="text-xs font-semibold text-orange-600">Updating live scores...</div>
              )}
              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {visibleCards.map((row, index) => (
                <motion.div
                  key={`${row.server}-${row.teamRank}`}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.03 }}
                  className={`grid grid-cols-1 gap-3 rounded-2xl border bg-gradient-to-r p-4 sm:grid-cols-[90px_1fr_140px_120px] sm:items-center ${rowGlow(
                    row.teamRank
                  )}`}
                >
                  <div className="text-lg font-black text-slate-900 sm:text-xl">
                    {rankBadge(row.teamRank)}
                  </div>
                  <div>
                    <div className="text-base font-bold text-slate-900 sm:text-lg">
                      {row.server}
                    </div>
                    <div className="text-sm text-slate-500">{row.shift}</div>
                  </div>
                  <div className="text-left text-xl font-black text-orange-600 sm:text-right sm:text-2xl">
                    ${safeNumber(row.avg).toFixed(2)}
                  </div>
                  <div className="text-left text-sm font-semibold text-slate-700 sm:text-right">
                    {statusLabel(row.teamRank)}
                  </div>
                </motion.div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-orange-200 bg-white/85 shadow-xl">
            <CardHeader className="px-4 pt-4">
              <CardTitle className="flex items-center gap-2 text-xl font-black sm:text-2xl">
                <Star className="h-6 w-6 text-orange-600" />
                {teamFilter} Quick View
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-sm font-bold uppercase tracking-wide text-emerald-700">
                  Top 3 Status
                </div>
                <div className="mt-2 space-y-2 text-sm text-slate-700">
                  <div>🥇 Rank 1 = Top Seller</div>
                  <div>🥈 Rank 2 = Strong</div>
                  <div>🥉 Rank 3 = Rising</div>
                  <div>⭐ Rank 4–5 = Close Behind</div>
                  <div>⚡ Rank 6+ = Push</div>
                </div>
              </div>

              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
                <div className="text-sm font-bold uppercase tracking-wide text-orange-700">
                  Competition Rule
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  {stageFilter === "Stage 1"
                    ? `Rankings at ${VENUE_NAME} are based on average check, not total sales. Top 3 from each team qualify for Stage 2.`
                    : `Stage 2 shows only qualified servers. The highest average in each team wins.`}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-bold uppercase tracking-wide text-slate-700">
                  Best Upsell Reminder
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  Suggest one food upgrade and one drink add-on at every table at Smitty&apos;s at Market Mall.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {stageFilter === "Stage 1" && (
          <Card className="rounded-3xl border-orange-200 bg-white/85 shadow-xl">
            <CardHeader className="px-4 pt-4">
              <CardTitle className="flex items-center gap-2 text-xl font-black sm:text-2xl">
                <Medal className="h-6 w-6 text-orange-600" />
                {teamFilter} Rankings
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[760px] border-separate border-spacing-y-3">
                  <thead>
                    <tr className="text-left text-sm uppercase tracking-wide text-slate-500">
                      <th className="px-4">Rank</th>
                      <th className="px-4">Server</th>
                      <th className="px-4">Team</th>
                      <th className="px-4 text-right">Avg Check</th>
                      <th className="px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, index) => (
                      <motion.tr
                        key={`${row.server}-table-${row.teamRank}`}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: index * 0.02 }}
                        className={`rounded-2xl border bg-gradient-to-r ${rowGlow(row.teamRank)}`}
                      >
                        <td className="rounded-l-2xl border-y border-l px-4 py-4 font-black text-slate-900">
                          {rankBadge(row.teamRank)}
                        </td>
                        <td className="border-y px-4 py-4 font-semibold text-slate-900">
                          {row.server}
                        </td>
                        <td className="border-y px-4 py-4 text-slate-600">{row.shift || "—"}</td>
                        <td className="border-y px-4 py-4 text-right font-black text-orange-600">
                          ${safeNumber(row.avg).toFixed(2)}
                        </td>
                        <td className="rounded-r-2xl border-y border-r px-4 py-4 text-right font-semibold text-slate-700">
                          {statusLabel(row.teamRank)}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 lg:hidden">
                {filteredRows.map((row, index) => (
                  <motion.div
                    key={`${row.server}-mobile-${row.teamRank}`}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: index * 0.02 }}
                    className={`rounded-2xl border bg-gradient-to-r p-4 ${rowGlow(row.teamRank)}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-black text-slate-900">
                          {rankBadge(row.teamRank)}
                        </div>
                        <div className="mt-1 text-base font-bold text-slate-900">{row.server}</div>
                        <div className="text-sm text-slate-500">{row.shift || "—"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-black text-orange-600">
                          ${safeNumber(row.avg).toFixed(2)}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-700">
                          {statusLabel(row.teamRank)}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}



