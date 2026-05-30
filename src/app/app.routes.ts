import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { ShellComponent } from './core/shell/shell.component';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
    title: 'Sign in',
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
        title: 'Overview',
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
        title: 'EMS registers',
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
        path: 'manual',
        loadComponent: () => import('./features/manual/manual.component').then((m) => m.ManualComponent),
        title: 'User manual',
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
