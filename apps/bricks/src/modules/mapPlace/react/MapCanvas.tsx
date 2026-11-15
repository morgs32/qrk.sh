"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import { makeComponentView } from "../../react/makeComponentView";
import { mapCanvasComponentMetadata } from "../definition/generator/MapCanvasComponentMetadata";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.PUBLIC_MAPBOX_TOKEN;

export const mapCanvasView = makeComponentView(mapCanvasComponentMetadata, {
  component(props) {
    const { longitude, latitude, googlePlaceId, name } = props;
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
      const container = mapContainerRef.current;
      if (container === null) return;
      const update = () => setVisible(container.getClientRects().length > 0);
      const observer = new ResizeObserver(update);
      observer.observe(container);
      update();
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      const container = mapContainerRef.current;
      if (container === null || !visible) {
        return;
      }

      if (MAPBOX_TOKEN === undefined || MAPBOX_TOKEN.length === 0) {
        throw new Error("A public Mapbox token is required to render Map bricks");
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
    }, [googlePlaceId, latitude, longitude, visible]);

    return (
      <div
        className="relative min-h-[200px] w-full overflow-hidden bg-muted"
        onClick={(event) => event.stopPropagation()}
      >
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
