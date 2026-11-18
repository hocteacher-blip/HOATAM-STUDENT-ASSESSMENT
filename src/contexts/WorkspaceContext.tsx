import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { academicYearService } from '../services/academicYearService';
import { classStudentService } from '../services/classStudentService';
import { systemService } from '../services/systemService';
import {
  computeOperatorPermissions,
  teacherService,
  type OperatorPermissions,
} from '../services/teacherService';
import type {
  AcademicYear,
  AppSettings,
  SchoolClass,
  Teacher,
  TeacherAssignment,
  TeacherRole,
  TeacherRoleGrant,
} from '../types/models';

interface WorkspaceContextValue {
  settings: AppSettings | null;
  academicYears: AcademicYear[];
  activeYear: AcademicYear | null;
  classes: SchoolClass[];
  teachers: Teacher[];
  teacherRoles: TeacherRole[];
  teacherRoleGrants: TeacherRoleGrant[];
  teacherAssignments: TeacherAssignment[];
  operatorMode: 'ADMIN' | 'TEACHER';
  activeTeacher: Teacher | null;
  permissions: OperatorPermissions;
  theme: 'light' | 'dark';
  isLoading: boolean;
  setTheme: (nextTheme: 'light' | 'dark') => Promise<void>;
  setActiveYearId: (yearId: string) => Promise<void>;
  setLocalOperator: (mode: 'ADMIN' | 'TEACHER', teacherId?: string) => Promise<void>;
  refreshWorkspace: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

function applyDocumentTheme(mode: 'light' | 'dark') {
  const root = document.documentElement;
  if (mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherRoles, setTeacherRoles] = useState<TeacherRole[]>([]);
  const [teacherRoleGrants, setTeacherRoleGrants] = useState<TeacherRoleGrant[]>([]);
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([]);
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const [isLoading, setIsLoading] = useState(true);

  const refreshWorkspace = useCallback(async () => {
    const [settingsRes, yearsRes, classesRes, teachersRes, rolesRes, grantsRes, assignsRes] =
      await Promise.all([
        systemService.getSettings(),
        academicYearService.list(),
        classStudentService.listClasses(),
        teacherService.listTeachers(),
        teacherService.listRoles(),
        teacherService.listRoleGrants(),
        teacherService.listAssignments(),
      ]);

    if (settingsRes.ok) {
      setSettings(settingsRes.data);
      const resolvedTheme = settingsRes.data.themeMode === 'dark' ? 'dark' : 'light';
      setThemeState(resolvedTheme);
      applyDocumentTheme(resolvedTheme);
    }
    if (yearsRes.ok) setAcademicYears(yearsRes.data);
    if (classesRes.ok) setClasses(classesRes.data);
    if (teachersRes.ok) setTeachers(teachersRes.data);
    if (rolesRes.ok) setTeacherRoles(rolesRes.data);
    if (grantsRes.ok) setTeacherRoleGrants(grantsRes.data);
    if (assignsRes.ok) setTeacherAssignments(assignsRes.data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  const setTheme = useCallback(async (nextTheme: 'light' | 'dark') => {
    setThemeState(nextTheme);
    applyDocumentTheme(nextTheme);
    const res = await systemService.updateSettings({ themeMode: nextTheme });
    if (res.ok) {
      setSettings(res.data);
    }
  }, []);

  const setActiveYearId = useCallback(
    async (yearId: string) => {
      await systemService.updateSettings({ activeAcademicYearId: yearId });
      await refreshWorkspace();
    },
    [refreshWorkspace]
  );

  const setLocalOperator = useCallback(
    async (mode: 'ADMIN' | 'TEACHER', teacherId?: string) => {
      await systemService.updateSettings({
        activeOperatorMode: mode,
        activeOperatorTeacherId: mode === 'TEACHER' ? teacherId : undefined,
      });
      await refreshWorkspace();
    },
    [refreshWorkspace]
  );

  const activeYear =
    academicYears.find((y) => y.id === settings?.activeAcademicYearId) ??
    academicYears.find((y) => y.isCurrent) ??
    academicYears[0] ??
    null;

  const activeTeacher = useMemo(() => {
    if (settings?.activeOperatorMode !== 'TEACHER' || !settings.activeOperatorTeacherId) {
      return null;
    }
    return teachers.find((t) => t.id === settings.activeOperatorTeacherId) ?? null;
  }, [settings?.activeOperatorMode, settings?.activeOperatorTeacherId, teachers]);

  const operatorMode: 'ADMIN' | 'TEACHER' =
    settings?.activeOperatorMode === 'TEACHER' && activeTeacher ? 'TEACHER' : 'ADMIN';

  const yearAssignments = useMemo(() => {
    if (!activeYear) return teacherAssignments;
    return teacherAssignments.filter((a) => a.academicYearId === activeYear.id);
  }, [teacherAssignments, activeYear]);

  const yearClasses = useMemo(() => {
    if (!activeYear) return classes;
    return classes.filter((c) => c.academicYearId === activeYear.id);
  }, [classes, activeYear]);

  const permissions = useMemo(
    () =>
      computeOperatorPermissions({
        mode: operatorMode,
        teacherId: activeTeacher?.id,
        roleGrants: teacherRoleGrants,
        assignments: yearAssignments,
        classes: yearClasses,
      }),
    [operatorMode, activeTeacher?.id, teacherRoleGrants, yearAssignments, yearClasses]
  );

  return (
    <WorkspaceContext.Provider
      value={{
        settings,
        academicYears,
        activeYear,
        classes,
        teachers,
        teacherRoles,
        teacherRoleGrants,
        teacherAssignments,
        operatorMode,
        activeTeacher,
        permissions,
        theme,
        isLoading,
        setTheme,
        setActiveYearId,
        setLocalOperator,
        refreshWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace phải được sử dụng bên trong WorkspaceProvider.');
  }
  return ctx;
}
