import { useAuth } from "../context/AuthContext"
import "./Header.css"

export default function Header() {
  const { user, signOutUser } = useAuth()
  if (!user) return null

  return (
    <header className="app-header">
      <div className="app-header-brand">
        <span className="app-header-dot" />
        AI Interview Coach
      </div>
      <div className="app-header-user">
        {user.photoURL ? (
          <img
            className="app-header-avatar"
            src={user.photoURL}
            alt={user.displayName || "Account"}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="app-header-avatar app-header-avatar--fallback">
            {(user.displayName || user.email || "?").charAt(0).toUpperCase()}
          </span>
        )}
        <span className="app-header-name">{user.displayName || user.email}</span>
        <button className="app-header-signout" onClick={signOutUser}>Sign out</button>
      </div>
    </header>
  )
}