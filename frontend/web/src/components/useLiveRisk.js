import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

export const API_BASE = "https://zensurex-backend.onrender.com";

// Loads /risk/ for the logged-in worker. Uses GPS first and falls back to the saved city.
export default function useLiveRisk() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      navigate("/login");
      return undefined;
    }

    let cancelled = false;
    const city = localStorage.getItem("city");
    const headers = { Authorization: `Bearer ${token}` };

    setLoading(true);

    async function load(params) {
      try {
        const res = await axios.get(`${API_BASE}/risk/`, { headers, params });
        if (!cancelled) {
          setData(res.data);
          setError("");
          setLoading(false);
        }
      } catch (err) {
        if (err.response?.status === 401) {
          localStorage.removeItem("token");
          navigate("/login");
          return;
        }
        if (params && params.lat !== undefined) {
          load(city ? { city } : {});
          return;
        }
        if (!cancelled) {
          setError("Could not load live conditions. Try again.");
          setLoading(false);
        }
      }
    }

    const byCity = () => load(city ? { city } : {});

    if (!navigator.geolocation) {
      byCity();
    } else {
      navigator.geolocation.getCurrentPosition(
        pos => load({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => byCity(),
        { timeout: 10000 }
      );
    }

    return () => {
      cancelled = true;
    };
  }, [navigate, tick]);

  return { data, loading, error, refresh: () => setTick(t => t + 1) };
}
