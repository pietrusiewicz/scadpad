// Uchwyt montażowy — domyślny przykład scadpada.
// Przesuń suwaki po lewej albo zmień kod i kliknij „Renderuj” (Ctrl+Enter).

/* [Płyta] */
width = 60;      // [20:150:5]
depth = 40;      // [20:150:5]
thick = 5;       // [2:15:1]
corner_r = 4;    // [1:15:0.5]

/* [Otwory montażowe] */
hole_d = 4;      // [2:10:0.5]
inset = 8;       // [3:20:1]

module rounded_plate(w, d, t, r) {
  hull() {
    for (x = [r, w - r], y = [r, d - r]) {
      translate([x, y, 0])
        cylinder(h = t, r = r, $fn = 48);
    }
  }
}

difference() {
  rounded_plate(width, depth, thick, corner_r);

  for (x = [inset, width - inset], y = [inset, depth - inset]) {
    translate([x, y, -1])
      cylinder(h = thick + 2, d = hole_d, $fn = 48);
  }
}
