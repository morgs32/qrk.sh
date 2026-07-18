"use client";

import mapboxgl from "mapbox-gl";
import { useEffect, useRef } from "react";

const MAPBOX_TOKEN = import.meta.env.PUBLIC_MAPBOX_TOKEN;

export function MapPlace4x4(props: {
  data: {
    googlePlaceId: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  };
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mapContainerRef.current === null) {
      return;
    }

    if (MAPBOX_TOKEN === undefined || MAPBOX_TOKEN.length === 0) {
      throw new Error("PUBLIC_MAPBOX_TOKEN is required to render Map bricks");
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [props.data.longitude, props.data.latitude],
      zoom: 14,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

    const marker = new mapboxgl.Marker()
      .setLngLat([props.data.longitude, props.data.latitude])
      .addTo(map);
    marker.getElement().dataset.mapMarkerPlaceId = props.data.googlePlaceId;

    return () => {
      marker.remove();
      map.remove();
    };
  }, [props.data.googlePlaceId, props.data.latitude, props.data.longitude]);

  return (
    <div
      aria-label={`Map of ${props.data.name}`}
      className="h-full w-full overflow-hidden bg-muted"
      data-map-place-id={props.data.googlePlaceId}
      ref={mapContainerRef}
    />
  );
}
