import type { Ref } from 'react';

import { Menu, Moon, Sun } from 'lucide-react';

import { useTheme } from './theme';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function Navbar({
  explorerOpen,
  explorerTriggerRef,
  onOpenExplorer,
}: {
  explorerOpen?: boolean;
  explorerTriggerRef?: Ref<HTMLButtonElement>;
  onOpenExplorer?: () => void;
}) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="app-header">
      <div className="navbar-context">
        <span className="navbar-context-name">Framework</span>
        <span className="header-divider" aria-hidden="true">
          /
        </span>
        <span>System architecture</span>
      </div>
      <div className="header-end">
        <div className="theme-toggle">
          <Sun
            className={`theme-icon ${theme === 'light' ? 'is-active' : ''}`}
            aria-hidden="true"
          />
          <Switch
            className="theme-switch"
            checked={theme === 'dark'}
            onCheckedChange={checked => setTheme(checked ? 'dark' : 'light')}
            aria-label="Dark mode"
          />
          <Moon
            className={`theme-icon ${theme === 'dark' ? 'is-active' : ''}`}
            aria-hidden="true"
          />
        </div>
        {onOpenExplorer && (
          <Tooltip>
            <TooltipTrigger
              ref={explorerTriggerRef}
              render={
                <Button variant="outline" size="icon" className="menu-toggle" />
              }
              onClick={onOpenExplorer}
              aria-label="Open explorer"
              aria-expanded={explorerOpen}
            >
              <Menu aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>Explore owners and connections</TooltipContent>
          </Tooltip>
        )}
      </div>
    </header>
  );
}
