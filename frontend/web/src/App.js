import {
BrowserRouter,
Routes,
Route,
Navigate,
useLocation
} from "react-router-dom";
import ForgotPassword from "./pages/ForgotPassword";

import { AnimatePresence } from "framer-motion";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ProtectedRoute from "./utils/ProtectedRoute";
import Navbar from "./components/Navbar";
import Dock from "./components/Dock";
import "leaflet/dist/leaflet.css";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Policy from "./pages/Policy";
import Claims from "./pages/Claims";

import PoolDetails from "./pages/PoolDetails";
import { AuthProvider } from "./pages/AuthContext";
import { AppProvider } from "./utils/AppContext";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import PaymentSetup from "./pages/PaymentSetup";
import AssistantPage from "./pages/AssistantPage";
function AppWrapper(){

const location = useLocation();

return(

<div className="app">

<Navbar/>

<div className="content">

<AnimatePresence mode="wait">

<Routes location={location} key={location.pathname}>

<Route path="/" element={<Home/>} />
<Route path="/forgot-password" element={<ForgotPassword />} />
<Route path="/login" element={<Login/>} />
<Route path="/payment-setup" element={<PaymentSetup />} />
<Route path="/signup" element={<Signup/>} />
<Route path="/settings" element={<Settings />} />
<Route path="/profile" element={<Profile/>}/>
{/* PROTECTED */}
<Route path="/assistant" element={<AssistantPage />} />
<Route path="/dashboard" element={
<ProtectedRoute>
<Dashboard/>
</ProtectedRoute>
} />
<Route path="/profile" element={
  <ProtectedRoute>
    <Profile/>
  </ProtectedRoute>
} />

<Route path="/policy" element={
<ProtectedRoute>
<Policy/>
</ProtectedRoute>
} />

<Route path="/claims" element={
<ProtectedRoute>
<Claims/>
</ProtectedRoute>
} />



<Route path="/pool" element={
<ProtectedRoute>
<PoolDetails/>
</ProtectedRoute>
} />


<Route path="*" element={<Navigate to="/"/>} />

</Routes>
</AnimatePresence>

</div>

<Dock/>

</div>

)

}



function App(){

return(
    <BrowserRouter>
      <AuthProvider>   {/* ✅ FIXED POSITION */}
        <AppProvider>
          <AppWrapper/>
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App;
