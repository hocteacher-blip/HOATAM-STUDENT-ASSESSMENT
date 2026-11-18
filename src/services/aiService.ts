import { ensureAppSettingsInitialized } from '../db/database';
import type { ServiceResult } from '../types/models';

export interface AiAssistantRequest {
  prompt: string;
  context?: string;
  taskType?: string;
}

export interface AiAssistantResponse {
  reply: string;
  model: string;
  generatedAt: string;
  isAdvisoryOnly: boolean;
}

export interface AiStudentAnalyzeRequest {
  anonymizedContext: string;
  teacherQuestion?: string;
  scope?: string;
}

export interface AiStudentStructuredAnalysis {
  summary: string;
  strengths: string[];
  supportNeeds: string[];
  dataGapsOrConflicts: string[];
  suggestedComments: string[];
  nextSupportActions: string[];
  disclaimer: string;
}

export interface AiStudentAnalyzeResponse {
  analysis: AiStudentStructuredAnalysis;
  model: string;
  generatedAt: string;
  isAdvisoryOnly: boolean;
}

async function checkAiAvailability(): Promise<string | null> {
  try {
    const settings = await ensureAppSettingsInitialized();
    if (settings.aiEnabled === false) {
      return 'Trợ lý AI đang được tắt trong phần Cài đặt hệ thống. Bạn vẫn có thể sử dụng phân tích dữ liệu cục bộ và toàn bộ chức năng đánh giá bình thường.';
    }
  } catch {
    // Ignore DB check error in non-browser/test environments
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'Thiết bị đang ngoại tuyến. Trợ lý AI trực tuyến tạm thời không khả dụng; các tính năng quản lý, đánh giá và tổng hợp cục bộ vẫn hoạt động bình thường.';
  }
  return null;
}

export const aiService = {
  async askAssistant(payload: AiAssistantRequest): Promise<ServiceResult<AiAssistantResponse>> {
    const blockedReason = await checkAiAvailability();
    if (blockedReason) {
      return { ok: false, error: blockedReason };
    }

    try {
      const response = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as Partial<AiAssistantResponse> & { error?: string };

      if (!response.ok) {
        return {
          ok: false,
          error: data.error || 'Máy chủ trợ lý AI tạm thời không phản hồi.',
        };
      }

      if (!data.reply) {
        return {
          ok: false,
          error: 'Không nhận được nội dung từ trợ lý AI.',
        };
      }

      return {
        ok: true,
        data: {
          reply: data.reply,
          model: data.model ?? 'gemini-4-hydrogen',
          generatedAt: data.generatedAt ?? new Date().toISOString(),
          isAdvisoryOnly: true,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? `Không thể kết nối tới trợ lý AI: ${error.message}`
            : 'Không thể kết nối tới trợ lý AI.',
      };
    }
  },

  async analyzeStudentEvidence(
    payload: AiStudentAnalyzeRequest
  ): Promise<ServiceResult<AiStudentAnalyzeResponse>> {
    const blockedReason = await checkAiAvailability();
    if (blockedReason) {
      return { ok: false, error: blockedReason };
    }

    try {
      const response = await fetch('/api/ai/analyze-student', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as Partial<AiStudentAnalyzeResponse> & { error?: string };

      if (!response.ok) {
        return {
          ok: false,
          error: data.error || 'Máy chủ trợ lý AI tạm thời không phản hồi.',
        };
      }

      if (!data.analysis) {
        return {
          ok: false,
          error: 'Không nhận được kết quả phân tích từ trợ lý AI.',
        };
      }

      return {
        ok: true,
        data: {
          analysis: data.analysis,
          model: data.model ?? 'gemini-4-hydrogen',
          generatedAt: data.generatedAt ?? new Date().toISOString(),
          isAdvisoryOnly: true,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? `Không thể kết nối tới trợ lý AI: ${error.message}`
            : 'Không thể kết nối tới trợ lý AI.',
      };
    }
  },
};
