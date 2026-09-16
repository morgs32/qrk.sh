"use client";

import { defineRegistry } from "@json-render/react";
import mapboxgl from "mapbox-gl";
import { useEffect, useRef } from "react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { mapPlaceJsonRenderCatalog } from "./MapPlaceJsonRenderCatalog";

const MAPBOX_TOKEN = import.meta.env.PUBLIC_MAPBOX_TOKEN;

function MapCanvas(props: {
  googlePlaceId: string;
  name: string;
  latitude: number;
  longitude: number;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (container === null) {
      return;
    }

    if (MAPBOX_TOKEN === undefined || MAPBOX_TOKEN.length === 0) {
      throw new Error("PUBLIC_MAPBOX_TOKEN is required to render Map bricks");
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [props.longitude, props.latitude],
      zoom: 14,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

    const marker = new mapboxgl.Marker()
      .setLngLat([props.longitude, props.latitude])
      .addTo(map);
    marker.getElement().dataset.mapMarkerPlaceId = props.googlePlaceId;

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(container);
    map.resize();

    return () => {
      resizeObserver.disconnect();
      marker.remove();
      map.remove();
    };
  }, [props.googlePlaceId, props.latitude, props.longitude]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-muted">
      <div
        aria-label={`Map of ${props.name}`}
        className="size-full"
        data-map-place-id={props.googlePlaceId}
        ref={mapContainerRef}
      />
    </div>
  );
}

export const { registry } = defineRegistry(mapPlaceJsonRenderCatalog, {
  components: {
    ...layoutRegistryComponents,
    MapCanvas: ({ props }) => (
      <MapCanvas
        googlePlaceId={typeof props.googlePlaceId === "string" ? props.googlePlaceId : ""}
        name={typeof props.name === "string" ? props.name : ""}
        latitude={typeof props.latitude === "number" ? props.latitude : 0}
        longitude={typeof props.longitude === "number" ? props.longitude : 0}
      />
    ),
  },
});
