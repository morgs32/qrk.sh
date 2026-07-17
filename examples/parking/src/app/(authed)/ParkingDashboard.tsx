'use client';

import { useInitializedStateOrThrow } from '@zerospin/react/useInitializedStateOrThrow';
import { useLiveQuery } from '@zerospin/react/useLiveQuery';
import { Building2, CarFront, MapPinned, Warehouse } from 'lucide-react';

import { ZerospinOwner, ZerospinProviderAdmin } from './ZerospinParking';

export function ParkingDashboard() {
  const providerState = useInitializedStateOrThrow(ZerospinProviderAdmin);
  const ownerState = useInitializedStateOrThrow(ZerospinOwner);
  const { data: destinations = [] } = useLiveQuery(ZerospinProviderAdmin, {
    query: db => db.query.destination.findMany(),
    deps: [],
  });
  const { data: carparks = [] } = useLiveQuery(ZerospinProviderAdmin, {
    query: db => db.query.carpark.findMany(),
    deps: [],
  });
  const { data: garages = [] } = useLiveQuery(ZerospinOwner, {
    query: db => db.query.garage.findMany(),
    deps: [],
  });
  const { data: cars = [] } = useLiveQuery(ZerospinOwner, {
    query: db => db.query.car.findMany(),
    deps: [],
  });

  return (
    <main className="flex flex-1 flex-col gap-6 bg-muted/30 p-4 md:p-6">
      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border bg-background p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPinned className="size-4" />
            Destinations
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {destinations.length}
          </div>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="size-4" />
            Carparks
          </div>
          <div className="mt-2 text-2xl font-semibold">{carparks.length}</div>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Warehouse className="size-4" />
            Garages
          </div>
          <div className="mt-2 text-2xl font-semibold">{garages.length}</div>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CarFront className="size-4" />
            Cars
          </div>
          <div className="mt-2 text-2xl font-semibold">{cars.length}</div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Provider View
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {providerState.actorId}
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {carparks.map(carpark => {
              const destination = destinations.find(
                row => row.id === carpark.destinationId,
              );
              return (
                <article
                  key={carpark.id}
                  className="rounded-lg border bg-background p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold leading-tight">
                        {carpark.name}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {destination?.name ?? 'Unassigned destination'}
                      </p>
                    </div>
                    <div className="font-mono text-sm font-semibold">
                      ${carpark.hourlyRate.toFixed(2)}/hr
                    </div>
                  </div>
                  <p className="mt-3 text-sm">{carpark.address}</p>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {carpark.amenities ?? 'No amenities listed'}
                  </p>
                </article>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Driver View
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {ownerState.actorId}
            </p>
          </div>
          <div className="space-y-3">
            {garages.map(garage => (
              <article
                key={garage.id}
                className="rounded-lg border bg-background p-4"
              >
                <h3 className="font-semibold leading-tight">{garage.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {garage.address}
                </p>
                <div className="mt-4 space-y-2">
                  {cars
                    .filter(car => car.garageId === garage.id)
                    .map(car => (
                      <div
                        key={car.id}
                        className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
                      >
                        <span className="text-sm font-medium">
                          {car.make} {car.model}
                        </span>
                        <span className="font-mono text-sm">
                          {car.licensePlate}
                        </span>
                      </div>
                    ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
