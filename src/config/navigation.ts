import {
  BarChart3,
  BookOpen,
  Briefcase,
  Calendar,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  DatabaseBackup,
  FileSpreadsheet,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  School,
  Settings,
  Sparkles,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  group: 'core' | 'curriculum' | 'assessment' | 'system';
}

export const NAV_GROUPS: Array<{ key: NavItem['group']; title: string }> = [
  { key: 'core', title: 'Tổng quan & Tổ chức' },
  { key: 'curriculum', title: 'Chương trình & Lịch dạy' },
  { key: 'assessment', title: 'Đánh giá học sinh' },
  { key: 'system', title: 'Báo cáo & Hệ thống' },
];

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Tổng quan', path: '/', icon: LayoutDashboard, group: 'core' },
  { id: 'my-work', label: 'Công việc của tôi', path: '/cong-viec-cua-toi', icon: Briefcase, group: 'core' },
  { id: 'academic-years', label: 'Năm học', path: '/nam-hoc', icon: Calendar, group: 'core' },
  { id: 'teachers', label: 'Giáo viên', path: '/giao-vien', icon: Users, group: 'core' },
  { id: 'assignments', label: 'Phân công nhiệm vụ', path: '/phan-cong', icon: UserCheck, group: 'core' },
  { id: 'classes', label: 'Lớp học', path: '/lop-hoc', icon: School, group: 'core' },
  { id: 'students', label: 'Học sinh', path: '/hoc-sinh', icon: GraduationCap, group: 'core' },

  { id: 'subjects', label: 'Môn học', path: '/mon-hoc', icon: BookOpen, group: 'curriculum' },
  { id: 'criteria', label: 'Tiêu chí đánh giá', path: '/tieu-chi', icon: ListChecks, group: 'curriculum' },
  { id: 'timetable', label: 'Thời khóa biểu', path: '/thoi-khoa-bieu', icon: CalendarDays, group: 'curriculum' },

  { id: 'daily-assessment', label: 'Đánh giá hằng ngày', path: '/danh-gia-hang-ngay', icon: CheckSquare, group: 'assessment' },
  { id: 'lesson-assessment', label: 'Đánh giá theo tiết học', path: '/danh-gia-tiet-hoc', icon: ClipboardList, group: 'assessment' },
  { id: 'periodic-assessment', label: 'Đánh giá định kỳ', path: '/danh-gia-dinh-ky', icon: ClipboardCheck, group: 'assessment' },

  { id: 'ai-assistant', label: 'Trợ lý AI', path: '/tro-ly-ai', icon: Sparkles, group: 'system' },
  { id: 'reports', label: 'Báo cáo – thống kê', path: '/bao-cao', icon: BarChart3, group: 'system' },
  { id: 'import-export', label: 'Nhập/xuất dữ liệu', path: '/nhap-xuat', icon: FileSpreadsheet, group: 'system' },
  { id: 'backup-restore', label: 'Sao lưu – khôi phục', path: '/sao-luu', icon: DatabaseBackup, group: 'system' },
  { id: 'settings', label: 'Cài đặt', path: '/cai-dat', icon: Settings, group: 'system' },
];
