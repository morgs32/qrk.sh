"use client";

import mapboxgl from "mapbox-gl";
import { useEffect, useRef } from "react";
import { makeComponentView } from "../make/makeComponentView";
import { mapCanvasComponent } from "@qrk.sh/zerospin/src/modules/mapPlace/generator/MapCanvasComponent";

const MAPBOX_TOKEN = process.env.PUBLIC_MAPBOX_TOKEN;

export const mapCanvasView = makeComponentView(mapCanvasComponent, {
  component(props) {
    const { longitude, latitude, googlePlaceId, name } = props;
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
        center: [longitude, latitude],
        zoom: 14,
        attributionControl: false,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

      const marker = new mapboxgl.Marker().setLngLat([longitude, latitude]).addTo(map);
      marker.getElement().dataset.mapMarkerPlaceId = googlePlaceId;

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
    }, [googlePlaceId, latitude, longitude]);

    return (
      <div className="relative min-h-[200px] w-full overflow-hidden bg-muted">
        <div
          aria-label={`Map of ${name}`}
          className="absolute! inset-0"
          data-map-place-id={googlePlaceId}
          ref={mapContainerRef}
        />
      </div>
    );
  },
});
