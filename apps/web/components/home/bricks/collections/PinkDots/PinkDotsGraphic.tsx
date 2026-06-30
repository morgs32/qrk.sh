export function PinkDotsGraphic() {
  return (
    <div className="grid max-h-[85%] max-w-[85%] shrink-0 grid-cols-3 gap-3">
      {[...Array(9)].map((_, index) => (
        <div key={index} className="h-3 w-3 rounded-full bg-current" />
      ))}
    </div>
  );
}
