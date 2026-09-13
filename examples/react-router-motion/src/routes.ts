import { index, layout, route } from "@react-router/dev/routes";

export default [
  index("routes/Home.jsx"),
  layout("routes/LeftDrawerLayout.jsx", [
    route("catalog", "routes/Catalog.jsx"),
    route("brick/:brickId", "routes/BrickDetail.jsx"),
  ]),
  layout("routes/RightDrawerLayout.jsx", [route("compose", "routes/Compose.jsx")]),
];
