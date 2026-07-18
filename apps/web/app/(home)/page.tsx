const occupiedPixelCells = [
  // Q
  { row: 1, column: 2 },
  { row: 1, column: 3 },
  { row: 2, column: 1 },
  { row: 2, column: 4 },
  { row: 3, column: 1 },
  { row: 3, column: 4 },
  { row: 4, column: 1 },
  { row: 4, column: 4 },
  { row: 5, column: 2 },
  { row: 5, column: 3 },
  { row: 6, column: 4 },

  // R
  { row: 1, column: 7 },
  { row: 1, column: 8 },
  { row: 1, column: 9 },
  { row: 2, column: 7 },
  { row: 2, column: 10 },
  { row: 3, column: 7 },
  { row: 3, column: 8 },
  { row: 3, column: 9 },
  { row: 4, column: 7 },
  { row: 4, column: 9 },
  { row: 5, column: 7 },
  { row: 5, column: 10 },

  // K
  { row: 1, column: 13 },
  { row: 1, column: 16 },
  { row: 2, column: 13 },
  { row: 2, column: 15 },
  { row: 3, column: 13 },
  { row: 3, column: 14 },
  { row: 4, column: 13 },
  { row: 4, column: 15 },
  { row: 5, column: 13 },
  { row: 5, column: 16 },

  // Period
  { row: 5, column: 19 },

  // S
  { row: 1, column: 23 },
  { row: 1, column: 24 },
  { row: 1, column: 25 },
  { row: 2, column: 22 },
  { row: 3, column: 23 },
  { row: 3, column: 24 },
  { row: 4, column: 25 },
  { row: 5, column: 22 },
  { row: 5, column: 23 },
  { row: 5, column: 24 },

  // H
  { row: 1, column: 28 },
  { row: 1, column: 31 },
  { row: 2, column: 28 },
  { row: 2, column: 31 },
  { row: 3, column: 28 },
  { row: 3, column: 29 },
  { row: 3, column: 30 },
  { row: 3, column: 31 },
  { row: 4, column: 28 },
  { row: 4, column: 31 },
  { row: 5, column: 28 },
  { row: 5, column: 31 },
];

export default function HomePage() {
  return (
    <main className="h-svh overflow-x-auto overflow-y-hidden">
      <div
        aria-label="QRK.SH pixel wordmark"
        className="grid h-full w-max"
        style={{
          gridTemplateColumns: "repeat(31, calc(100svh / 6))",
          gridTemplateRows: "repeat(6, calc(100svh / 6))",
        }}
      >
        {occupiedPixelCells.map((pixel, index) => (
          <a
            aria-label={`QRK.SH pixel ${index + 1}`}
            className="block bg-black hover:bg-[#E86F3A] focus-visible:bg-[#E86F3A] focus-visible:outline-4 focus-visible:-outline-offset-4 focus-visible:outline-white"
            href="#"
            key={`${pixel.row}-${pixel.column}`}
            style={{
              gridColumnStart: pixel.column,
              gridRowStart: pixel.row,
            }}
          />
        ))}
      </div>
    </main>
  );
}
