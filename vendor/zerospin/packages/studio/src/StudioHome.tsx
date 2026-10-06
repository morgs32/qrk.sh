import { useEffect, useRef, useState } from 'react';

import type { IRepoType, ISystemSpec } from '@zerospin/core/system/types';
import { Dropdown } from '@zerospin/fragment-ui/Dropdown';
import { FragmentAppearance } from '@zerospin/fragment-ui/FragmentAppearance';
import { Outline, OutlineItem } from '@zerospin/fragment-ui/Outline';
import { Link } from 'react-router';

import { AggregateAgentSearch } from './AggregateAgentSearch.js';
import '@zerospin/fragment-ui/styles.css';

import './studio-home.css';

export function StudioHome({
  systemSpec,
  repoTypes,
}: {
  systemSpec: ISystemSpec;
  repoTypes: readonly IRepoType[];
}) {
  const homepageRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    try {
      const saved = localStorage.getItem('zerospin-studio-home-theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    } catch {
      // A remembered preference is optional when browser storage is unavailable.
    }
    return 'system';
  });
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const appearance =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  return (
    <FragmentAppearance
      ref={homepageRef}
      theme={appearance}
      className="studio-home"
    >
      <div className="studio-home-theme-menu">
        <Dropdown
          label={`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`}
          portalContainer={homepageRef}
          items={(['light', 'dark', 'system'] as const).map(option => ({
            id: option,
            label: option.charAt(0).toUpperCase() + option.slice(1),
            onClick: () => {
              setTheme(option);
              try {
                localStorage.setItem('zerospin-studio-home-theme', option);
              } catch {
                // Theme selection still works for this visit without storage.
              }
            },
          }))}
        />
      </div>
      <main className="studio-home-content">
        <h1>Admin</h1>
        <Outline aria-label="Admin" type="1">
          <OutlineItem label="Aggregates">
            <Outline type="A" data-numbering="upper-alpha">
              {Object.values(systemSpec.aggregates)
                .flatMap(versions => Object.values(versions))
                .map(aggregate => (
                  <OutlineItem
                    key={`${aggregate.name}@${aggregate.version}`}
                    label={
                      <Link
                        to={`/agents/${encodeURIComponent(aggregate.name)}/${encodeURIComponent(aggregate.version)}`}
                      >
                        {aggregate.name}: {aggregate.version}
                      </Link>
                    }
                  >
                    <Outline muted type="a" data-numbering="lower-alpha">
                      <OutlineItem label="models">
                        <Outline type="1">
                          {Object.values(aggregate.models).map(model => (
                            <OutlineItem
                              key={model.modelName}
                              label={`${model.modelName}: ${model.version}`}
                            />
                          ))}
                        </Outline>
                      </OutlineItem>
                      <OutlineItem label="contracts">
                        <Outline type="1">
                          {Object.values(aggregate.actors)
                            .flatMap(actor =>
                              Object.values(actor.contracts).map(contract => ({
                                actorName: actor.name,
                                commandName: contract.commandName,
                                version: contract.version,
                              })),
                            )
                            .map(contract => (
                              <OutlineItem
                                key={`${contract.actorName}.${contract.commandName}`}
                                label={`${contract.actorName}.${contract.commandName}: ${contract.version}`}
                              />
                            ))}
                        </Outline>
                      </OutlineItem>
                      <OutlineItem label="agents">
                        <AggregateAgentSearch
                          aggregateName={aggregate.name}
                          aggregateVersion={aggregate.version}
                          agentNames={Object.values(systemSpec.agents)
                            .filter(
                              agent =>
                                agent.aggregateName === aggregate.name &&
                                agent.aggregateVersion === aggregate.version,
                            )
                            .map(agent => agent.name)}
                          portalContainer={homepageRef}
                        />
                      </OutlineItem>
                    </Outline>
                  </OutlineItem>
                ))}
            </Outline>
          </OutlineItem>
        </Outline>
        <h1>Repos</h1>
        <Outline aria-label="Repos" type="A" data-numbering="upper-alpha">
          {repoTypes.map(repoType => (
            <OutlineItem
              key={repoType}
              label={<Link to={`/${repoType}`}>{repoType}</Link>}
            />
          ))}
        </Outline>
      </main>
    </FragmentAppearance>
  );
}
