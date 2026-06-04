import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { portalScopeGuard } from './core/auth/portal-scope.guard';
import { superadminGuard } from './core/auth/superadmin.guard';
import { ShellComponent } from './core/shell/shell.component';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
    title: 'Sign in',
  },
  {
    path: 'admin/login',
    loadComponent: () => import('./features/admin-login/admin-login.component').then((m) => m.AdminLoginComponent),
    title: 'Platform sign in',
  },
  {
    path: 'set-password',
    loadComponent: () => import('./features/set-password/set-password.component').then((m) => m.SetPasswordComponent),
    title: 'Set your password',
  },
  {
    path: 'admin',
    canActivate: [superadminGuard],
    loadComponent: () => import('./features/admin-console/admin-console.component').then((m) => m.AdminConsoleComponent),
    title: 'Platform console',
  },
  {
    path: 'report/print',
    canActivate: [authGuard],
    loadComponent: () => import('./features/report/report-print.component').then((m) => m.ReportPrintComponent),
    title: 'Audit report (PDF)',
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    canActivateChild: [portalScopeGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/overview/overview.component').then((m) => m.OverviewComponent),
        title: 'Overview',
      },
      {
        path: 'actions',
        loadComponent: () => import('./features/actions/actions.component').then((m) => m.ActionsComponent),
        title: 'Actions & alerts',
      },
      {
        path: 'settings/notifications',
        loadComponent: () =>
          import('./features/notifications/notification-settings.component').then((m) => m.NotificationSettingsComponent),
        title: 'Notification settings',
      },
      {
        path: 'portal',
        loadComponent: () => import('./features/portal/portal.component').then((m) => m.PortalComponent),
        title: 'Auditee portal',
      },
      {
        path: 'requests',
        loadComponent: () => import('./features/requests/requests.component').then((m) => m.RequestsComponent),
        title: 'Evidence requests',
      },
      {
        path: 'showcase',
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
        title: 'Capability showcase',
      },
      {
        path: 'audits',
        loadComponent: () => import('./features/audits/audits.component').then((m) => m.AuditsComponent),
        title: 'Audits',
      },
      {
        path: 'audit',
        loadComponent: () => import('./features/audit/audit.component').then((m) => m.AuditComponent),
        title: 'Audit',
      },
      {
        path: 'fieldwork',
        loadComponent: () => import('./features/fieldwork/fieldwork.component').then((m) => m.FieldworkComponent),
        title: 'Fieldwork',
      },
      {
        path: 'evidence',
        loadComponent: () => import('./features/evidence/evidence.component').then((m) => m.EvidenceComponent),
        title: 'Evidence',
      },
      {
        path: 'findings',
        loadComponent: () => import('./features/findings/findings.component').then((m) => m.FindingsComponent),
        title: 'Findings',
      },
      {
        path: 'registers',
        loadComponent: () => import('./features/registers/registers.component').then((m) => m.RegistersComponent),
        title: 'OH&S registers',
      },
      {
        path: 'report',
        loadComponent: () => import('./features/report/report.component').then((m) => m.ReportComponent),
        title: 'Report',
      },
      {
        path: 'programme',
        loadComponent: () => import('./features/programme/programme.component').then((m) => m.ProgrammeComponent),
        title: 'Audit programme',
      },
      {
        path: 'users',
        loadComponent: () => import('./features/users/users.component').then((m) => m.UsersComponent),
        title: 'Users',
      },
      {
        path: 'guide',
        loadComponent: () => import('./features/guide/guide.component').then((m) => m.GuideComponent),
        title: "Auditor's field guide",
      },
      {
        path: 'manual',
        loadComponent: () => import('./features/manual/manual.component').then((m) => m.ManualComponent),
        title: "Auditor's manual",
      },
      {
        path: 'copilot',
        loadComponent: () => import('./features/copilot/copilot.component').then((m) => m.CopilotComponent),
        title: 'Auditor copilot',
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
