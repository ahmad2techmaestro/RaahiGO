import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { getAiStatus } from "../lib/aiStatus";
import { useDispatch } from "react-redux";
import { FiArrowRight, FiChevronLeft, FiChevronRight, FiSliders, FiX, FiSearch, FiAlertTriangle } from "react-icons/fi";
import { API_BASE_URL } from "../config/api";
import { getToken } from "../lib/session";
import { addDays, formatDate, searchPath, toISODate } from "../lib/format";
import { removeall } from "../Redux/ticket/ticket.action";
import FilterPanel, { emptyFilters, countActive } from "../Components/Search/FilterPanel";
import BusCard from "../Components/Search/BusCard";
import BusCardSkeleton from "../Components/Search/BusCardSkeleton";
import HelpMeChoose from "../Components/AI/HelpMeChoose";
import EmptyState from "../ui/EmptyState";
import styles from "../Styles/search.module.css";

const SORT_OPTIONS = [
  { value: "departure:asc", label: "Earliest departure" },
  { value: "price:asc", label: "Lowest fare" },
  { value: "price:desc", label: "Highest fare" },
  { value: "duration:asc", label: "Shortest journey" },
  { value: "rating:desc", label: "Top rated" },
  { value: "seatsAvailable:desc", label: "Most seats free" },
];

const SORTS = ["departure", "price", "duration", "rating"];

/** Filters the AI planner (or a shared link) put in the URL. */
function filtersFromParams(sp) {
  const csv = (k) => (sp.get(k) || "").split(",").map((x) => x.trim()).filter(Boolean);
  const num = (k) => { const n = Number(sp.get(k)); return sp.get(k) && Number.isFinite(n) && n > 0 ? n : null; };
  return {
    ...emptyFilters,
    busType: csv("busType"), seatType: csv("seatType"),
    departureWindows: csv("dep"), arrivalWindows: csv("arr"),
    maxPrice: num("maxPrice"), minRating: num("minRating"),
  };
}
function sortFromParams(sp) {
  const [by, order] = (sp.get("sort") || "").split(":");
  return SORTS.includes(by) ? `${by}:${order === "desc" ? "desc" : "asc"}` : "departure:asc";
}

export default function SelectBus() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const date = searchParams.get("date");
  const today = toISODate();

  const [buses, setBuses] = useState([]);
  const [facets, setFacets] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [filters, setFilters] = useState(() => filtersFromParams(searchParams));
  const [sort, setSort] = useState(() => sortFromParams(searchParams));
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [aiAvailable, setAiAvailable] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    document.title = from && to ? `${from} → ${to} · RaahiGo` : "Search · RaahiGo";
    dispatch(removeall());
  }, [dispatch, from, to]);

  useEffect(() => {
    getAiStatus().then((data) => setAiAvailable(Boolean(data.aiEnabled)));
  }, []);

  // A new route invalidates filters, facets and paging.
  const urlFilterKey = ["maxPrice", "minRating", "busType", "seatType", "dep", "arr", "sort"].map((k) => searchParams.get(k) || "").join("|");
  useEffect(() => {
    setFilters(filtersFromParams(searchParams));
    setSort(sortFromParams(searchParams));
    setFacets(null);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, urlFilterKey]);

  const fetchBuses = useCallback(async () => {
    if (!from || !to || !date) {
      setErrorMsg("Missing route details. Please start a new search.");
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setErrorMsg("");
    const [sortBy, sortOrder] = sort.split(":");
    try {
      const { data } = await axios.post(`${API_BASE_URL}/bus/search`, { from, to, date, ...filters, sortBy, sortOrder, page, limit: 10 });
      if (id !== reqId.current) return; // a newer request superseded this one
      setBuses(data.buses || []);
      setPagination(data.pagination || null);
      // Facets describe the whole route — adopt them once so the sidebar doesn't shrink as you filter.
      setFacets((prev) => prev ?? data.facets ?? null);
      const token = getToken();
      if (token) {
        axios.post(`${API_BASE_URL}/search-history`, { from, to }, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
      }
    } catch (err) {
      if (id !== reqId.current) return;
      setErrorMsg(err?.response?.data?.message || "We couldn't load buses. Check your connection and try again.");
      setBuses([]);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [from, to, date, filters, sort, page]);

  useEffect(() => { fetchBuses(); }, [fetchBuses]);

  const handleFilterChange = (next) => { setFilters(next); setPage(1); };
  const handleReset = () => { setFilters(emptyFilters); setPage(1); };
  const handleBook = (bus) => navigate({ pathname: `/bookticket/${bus._id}`, search: `?date=${date}` });
  const goDate = (d) => navigate(searchPath(from, to, d), { replace: true });
  const swapRoute = () => navigate(searchPath(to, from, date), { replace: true });
  const active = countActive(filters);

  // "Smart picks": label the standout buses in the current results so the choice is obvious at a glance.
  const picks = useMemo(() => {
    const out = {};
    if (buses.length < 2) return out;
    const best = (key, dir) => buses.reduce((a, b) => (b[key] != null && (a[key] == null || (dir === "min" ? b[key] < a[key] : b[key] > a[key])) ? b : a));
    const add = (bus, label) => { if (bus) (out[bus._id] = out[bus._id] || []).push(label); };
    add(best("price", "min"), "Cheapest");
    if (buses.some((b) => b.durationHours != null)) add(best("durationHours", "min"), "Fastest");
    if (buses.some((b) => Number(b.rating) > 0)) add(best("rating", "max"), "Top rated");
    return out;
  }, [buses]);

  return (
    <div className={styles.page}>
      <div className={styles.banner}>
        <div className="container">
          <div className={styles.bannerRow}>
            <div>
              <span className="eyebrow" style={{ color: "var(--accent)" }}>Search results</span>
              <h1 className={styles.route}>
                {from} <button onClick={swapRoute} className={styles.swapBtn} aria-label="Reverse route"><FiArrowRight /></button> {to}
              </h1>
            </div>
            <div className={styles.dateNav} role="group" aria-label="Change date">
              <button onClick={() => goDate(addDays(date, -1))} disabled={!date || date <= today} aria-label="Previous day"><FiChevronLeft /></button>
              <div><strong>{formatDate(date, { weekday: "short", day: "numeric", month: "short" })}</strong>{date === today && <small>Today</small>}</div>
              <button onClick={() => goDate(addDays(date, 1))} aria-label="Next day"><FiChevronRight /></button>
            </div>
            <Link to="/" className="btn btn-sm" style={{ background: "rgba(255,255,255,.12)", color: "#fff", borderColor: "rgba(255,255,255,.25)" }}>
              <FiSearch size={14} /> New search
            </Link>
          </div>
        </div>
      </div>

      <div className={`container ${styles.layout}`}>
        <aside className={styles.sidebar} aria-label="Filters">
          <FilterPanel facets={facets} filters={filters} onChange={handleFilterChange} onReset={handleReset} resultCount={pagination?.total ?? 0} />
        </aside>

        <section className={styles.results} aria-live="polite" aria-busy={loading}>
          <div className={styles.toolbar}>
            <span className={styles.count}>
              {loading ? "Searching routes…" : <><strong>{pagination?.total ?? 0}</strong> {(pagination?.total ?? 0) === 1 ? "bus" : "buses"} available</>}
            </span>
            <div className={styles.toolbarRight}>
              <button className={`btn btn-sm btn-outline ${styles.filterBtn}`} onClick={() => setDrawer(true)}>
                <FiSliders size={14} /> Filters{active > 0 && <span className="count" style={{ background: "var(--brand)", color: "var(--brand-ink)", borderRadius: 99, padding: "0 7px" }}>{active}</span>}
              </button>
              <label className={styles.sort}>
                <span className="sr-only">Sort by</span>
                <select className="select" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
                  {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
          </div>

          {!loading && !errorMsg && buses.length > 0 && (
            <HelpMeChoose from={from} to={to} date={date} onBook={handleBook} aiAvailable={aiAvailable} />
          )}

          {loading && <div className={styles.list}>{[0, 1, 2].map((i) => <BusCardSkeleton key={i} />)}</div>}

          {!loading && errorMsg && (
            <EmptyState icon={<FiAlertTriangle size={24} />} title="Something went off-route"
              action={<button className="btn btn-primary" onClick={fetchBuses}>Try again</button>}>
              {errorMsg}
            </EmptyState>
          )}

          {!loading && !errorMsg && buses.length === 0 && (
            <EmptyState icon={<FiSearch size={24} />} title="No buses match yet"
              action={
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                  {active > 0 && <button className="btn btn-primary" onClick={handleReset}>Clear filters</button>}
                  <button className="btn btn-outline" onClick={() => goDate(addDays(date, 1))}>Try tomorrow</button>
                </div>
              }>
              {active > 0 ? "Widen your price range or clear a few filters to see more options on this route." : "There are no departures on this route for this date."}
            </EmptyState>
          )}

          {!loading && !errorMsg && buses.length > 0 && (
            <>
              <div className={styles.list}>
                {buses.map((bus, i) => <BusCard key={bus._id} bus={bus} index={i} onBook={handleBook} picks={picks[bus._id]} />)}
              </div>
              {pagination && pagination.totalPages > 1 && (
                <nav className={styles.pager} aria-label="Pagination">
                  <button className="btn btn-outline btn-sm" disabled={!pagination.hasPrevPage} onClick={() => { setPage((p) => p - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                    <FiChevronLeft /> Previous
                  </button>
                  <span>Page {pagination.page} of {pagination.totalPages}</span>
                  <button className="btn btn-outline btn-sm" disabled={!pagination.hasNextPage} onClick={() => { setPage((p) => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                    Next <FiChevronRight />
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      </div>

      {drawer && (
        <div className={styles.drawerWrap} role="dialog" aria-modal="true" aria-label="Filters">
          <div className={styles.drawerBackdrop} onClick={() => setDrawer(false)} />
          <div className={styles.drawerPanel}>
            <button className={`icon-btn ${styles.drawerClose}`} onClick={() => setDrawer(false)} aria-label="Close filters"><FiX /></button>
            <FilterPanel id="filters-mobile" facets={facets} filters={filters} onChange={handleFilterChange} onReset={handleReset} resultCount={pagination?.total ?? 0} />
            <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={() => setDrawer(false)}>Show {pagination?.total ?? 0} buses</button>
          </div>
        </div>
      )}
    </div>
  );
}
