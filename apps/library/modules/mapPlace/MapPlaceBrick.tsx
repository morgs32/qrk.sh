"use client";

import mapboxgl from "mapbox-gl";
import { useEffect, useRef } from "react";

const MAPBOX_TOKEN = import.meta.env.PUBLIC_MAPBOX_TOKEN;

export function MapCanvas(props: {
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

    const marker = new mapboxgl.Marker().setLngLat([props.longitude, props.latitude]).addTo(map);
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

export function MapPlaceBrick(props: {
  state: {
    payload: { googlePlaceId: string };
    data: {
      googlePlaceId: string;
      name: string;
      latitude: number;
      longitude: number;
    };
  };
}) {
  return (
    <MapCanvas
      googlePlaceId={props.state.data.googlePlaceId}
      latitude={props.state.data.latitude}
      longitude={props.state.data.longitude}
      name={props.state.data.name}
    />
  );
}
