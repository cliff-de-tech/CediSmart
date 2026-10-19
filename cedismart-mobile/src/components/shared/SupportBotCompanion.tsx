import React from 'react';
import { TopBarSupportTooltip, TopBarSupportTooltipProps } from './TopBarSupportTooltip';

export interface SupportBotCompanionProps {
  userName?: string;
  screenContext?: 'dashboard' | 'budgets' | 'transactions' | 'settings' | 'auth';
  onOpenSupport: (options?: { startNewChat?: boolean }) => void;
  bottomOffset?: number;
  topOffset?: number;
  arrowRightOffset?: number;
}

/**
 * Re-export TopBarSupportTooltip as SupportBotCompanion for backward compatibility.
 * The floating button companion has been upgraded to the anchored top-bar speech bubble
 * that drops down directly from beneath the headset icon.
 */
export const SupportBotCompanion: React.FC<SupportBotCompanionProps> = (props) => {
  return <TopBarSupportTooltip {...props} />;
};

export default SupportBotCompanion;
