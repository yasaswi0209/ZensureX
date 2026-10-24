import { NavLink, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect } from "react";

const LINKS = [
  { to: "/", label: "Home" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/policy", label: "Policy" },
  { to: "/claims", label: "Claims" }
];

function Navbar() {

  const navigate = useNavigate();

  const [open, setOpen] = useState(false);

  const menuRef = useRef();

  let userName = null;

  try {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      userName = parsed.name;
    }
  } catch {
    console.log("Invalid user JSON");
  }

  function logout() {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/");
  }

  /* close dropdown when clicking outside */
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return (

    <header id="main-nav">

      <div className="nav-inner">

        {/* LOGO */}
        <div className="nav-logo" onClick={() => navigate("/")}>
          <span className="logo-text">
            Zensure<span className="logo-x">X</span>
          </span>
        </div>

        {/* LINKS */}
        <ul className="nav-links">
          {LINKS.map(link => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* RIGHT SIDE */}
        <div className="nav-actions">

          {userName ? (

            <div className="user-menu" ref={menuRef}>

              <div className="nav-user" onClick={() => setOpen(!open)}>
                👤 {userName}
              </div>

              {open && (
                <div className="user-dropdown">
                  <div onClick={() => navigate("/profile")}>👤 View Profile</div>
                  <div onClick={() => navigate("/settings")}>⚙️ Settings</div>
                  <hr />
                  <div onClick={logout}>🚪 Logout</div>
                </div>
              )}

            </div>

          ) : (

            <button className="nav-cta" onClick={() => navigate("/login")}>
              Login
            </button>

          )}

        </div>

      </div>

    </header>

  );

}

export default Navbar;
