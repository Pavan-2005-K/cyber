import type { ComponentType } from 'react'
import {
  Activity,
  ClipboardCheck,
  CreditCard,
  FileSearch,
  Fingerprint,
  FolderKanban,
  Image,
  LayoutDashboard,
  MailCheck,
  MessageSquareText,
  Network,
  ScanSearch,
  ScrollText,
  Server,
  Settings,
  ShieldAlert,
  Smartphone,
  UserRound,
  UserRoundSearch,
} from 'lucide-react'

export type DashboardNavigationItem = {
  label: string
  path: string
  icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>
}

export type DashboardNavigationSection = {
  label: string
  items: DashboardNavigationItem[]
}

export const dashboardNavigation: DashboardNavigationSection[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', path: '', icon: LayoutDashboard }],
  },
  {
    label: 'Investigation',
    items: [
      { label: 'Cases', path: 'cases', icon: FolderKanban },
      {
        label: 'Evidence Management',
        path: 'evidence-management',
        icon: FileSearch,
      },
      {
        label: 'Detection Findings',
        path: 'detection-findings',
        icon: Activity,
      },
    ],
  },
  {
    label: 'AI Analysis',
    items: [
      {
        label: 'Phishing URL Detection',
        path: 'phishing-url-detection',
        icon: ShieldAlert,
      },
      {
        label: 'Fake Profile Detection',
        path: 'fake-profile-detection',
        icon: UserRoundSearch,
      },
      {
        label: 'Scam & Spam Detection',
        path: 'scam-detection',
        icon: ScanSearch,
      },
      {
        label: 'APK Malware Analysis',
        path: 'apk-malware-analysis',
        icon: Smartphone,
      },
      {
        label: 'Image Forgery Detection',
        path: 'image-forgery-detection',
        icon: Image,
      },
      {
        label: 'Chat & Email Forensics',
        path: 'chat-email-forensics',
        icon: MessageSquareText,
      },
      {
        label: 'Credit Card Fraud Detection',
        path: 'credit-card-fraud-detection',
        icon: CreditCard,
      },
      {
        label: 'Network Intrusion Detection',
        path: 'network-intrusion-detection',
        icon: Network,
      },
      {
        label: 'Server Log Analysis',
        path: 'server-log-analysis',
        icon: Server,
      },
      {
        label: 'Fake Email Detection',
        path: 'fake-email-detection',
        icon: MailCheck,
      },
    ],
  },
  {
    label: 'Forensics',
    items: [
      {
        label: 'Evidence Integrity Verification',
        path: 'evidence-integrity-verification',
        icon: Fingerprint,
      },
      {
        label: 'Investigation Reports',
        path: 'investigation-reports',
        icon: ClipboardCheck,
      },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Audit Logs', path: 'audit-logs', icon: ScrollText },
      { label: 'Profile', path: 'profile', icon: UserRound },
      { label: 'Settings', path: 'settings', icon: Settings },
    ],
  },
]
