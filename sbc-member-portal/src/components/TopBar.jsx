export default function TopBar({ subtitle, title }) {
  return (
    <div className="top-bar">
      <div className="top-bar-sub">{subtitle}</div>
      <div className="top-bar-title">{title}</div>
    </div>
  )
}
