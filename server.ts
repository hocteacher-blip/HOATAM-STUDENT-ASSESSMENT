import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const disableHmr = process.env.DISABLE_HMR === 'true';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY chưa được cấu hình trên máy chủ.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'HOATAM Student Assessment',
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/ai/assistant', async (req, res) => {
    try {
      const { prompt, context, taskType } = req.body as {
        prompt?: string;
        context?: string;
        taskType?: string;
      };

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({
          error: 'Vui lòng nhập nội dung yêu cầu cho trợ lý AI.',
        });
        return;
      }

      const ai = getGeminiClient();

      const systemInstruction = [
        'Bạn là trợ lý sư phạm tiểu học chuyên nghiệp của hệ thống HOATAM Student Assessment.',
        'Hãy trả lời bằng tiếng Việt chuẩn mực, thân thiện, khích lệ học sinh tiểu học, phù hợp tinh thần đánh giá học sinh tiểu học.',
        'NGUYÊN TẮC BẮT BUỘC: Bạn chỉ đưa ra GỢI Ý tham khảo để giáo viên xem và quyết định; tuyệt đối không tự kết luận học sinh yếu kém từ một sự kiện đơn lẻ, không suy diễn khi thiếu dữ liệu, không gộp hành vi chủ nhiệm không liên quan vào nhận xét môn học, và luôn nhắc đây là gợi ý tham khảo.',
        taskType ? `Loại nhiệm vụ hiện tại: ${taskType}.` : '',
      ]
        .filter(Boolean)
        .join(' ');

      const fullContents = context && context.trim()
        ? `Ngữ cảnh dữ liệu đã ẩn danh:\n${context.trim()}\n\nYêu cầu của giáo viên:\n${prompt.trim()}`
        : prompt.trim();

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: fullContents,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      });

      const replyText = response.text?.trim();
      if (!replyText) {
        res.status(502).json({
          error: 'Trợ lý AI không trả về nội dung phản hồi. Vui lòng thử lại.',
        });
        return;
      }

      res.json({
        reply: replyText,
        model: 'gemini-4-hydrogen',
        generatedAt: new Date().toISOString(),
        isAdvisoryOnly: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Lỗi không xác định khi gọi trợ lý AI.';
      const statusCode =
        message.includes('GEMINI_API_KEY') ? 503 :
        message.includes('PERMISSION_DENIED') || message.includes('API_KEY_INVALID') ? 403 :
        message.includes('RESOURCE_EXHAUSTED') ? 429 : 500;

      res.status(statusCode).json({
        error: message,
      });
    }
  });

  app.post('/api/ai/analyze-student', async (req, res) => {
    try {
      const { anonymizedContext, teacherQuestion, scope } = req.body as {
        anonymizedContext?: string;
        teacherQuestion?: string;
        scope?: string;
      };

      if (!anonymizedContext || typeof anonymizedContext !== 'string' || !anonymizedContext.trim()) {
        res.status(400).json({
          error: 'Thiếu ngữ cảnh bằng chứng ẩn danh để Trợ lý AI phân tích.',
        });
        return;
      }

      const ai = getGeminiClient();

      const systemInstruction = [
        'Bạn là Trợ lý AI phân tích bằng chứng học tập tiểu học của hệ thống HOATAM Student Assessment.',
        'Mọi phân tích và mẫu nhận xét chỉ mang tính GỢI Ý THAM KHẢO cho giáo viên, TUYỆT ĐỐI KHÔNG phải kết luận chính thức.',
        'Quy tắc nghiêm ngặt:',
        '1. Không tự xác nhận hay áp đặt mức đánh giá chính thức thay giáo viên.',
        '2. Không kết luận học sinh yếu kém chỉ từ 1 sự kiện đơn lẻ.',
        '3. Nếu bằng chứng ít hoặc thiếu, phải nêu rõ thiếu dữ liệu trong dataGapsOrConflicts và từ chối suy diễn.',
        '4. Nếu phát hiện dữ liệu mâu thuẫn (ví dụ điểm cao nhưng nhận xét chưa hoàn thành, hoặc đánh giá các buổi trái ngược), chỉ rõ sự mâu thuẫn để giáo viên rà soát.',
        '5. Nếu phạm vi là môn học (SUBJECT), chỉ phân tích dựa trên bằng chứng của môn học đó; tuyệt đối không gộp hành vi chủ nhiệm không liên quan.',
        '6. Mẫu nhận xét (suggestedComments) phải ngắn gọn (1-2 câu), ngôn ngữ tích cực, khích lệ, phù hợp lứa tuổi tiểu học.',
      ].join(' ');

      const promptBody = [
        `Phạm vi: ${scope || 'Tổng hợp đánh giá'}`,
        anonymizedContext.trim(),
        teacherQuestion?.trim() ? `\nYêu cầu bổ sung của giáo viên: ${teacherQuestion.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: promptBody,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: 'Nhận định tổng hợp ngắn gọn mang tính gợi ý dựa trên bằng chứng hiện có.',
              },
              strengths: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Các điểm mạnh nổi bật có căn cứ từ dữ liệu.',
              },
              supportNeeds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Các nội dung học sinh cần được hỗ trợ hoặc rèn thêm.',
              },
              dataGapsOrConflicts: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Dữ liệu còn thiếu, ít bằng chứng hoặc các điểm mâu thuẫn cần giáo viên rà soát.',
              },
              suggestedComments: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2-3 mẫu nhận xét ngắn gọn, khích lệ, phù hợp lứa tuổi tiểu học để giáo viên tham khảo và chỉnh sửa.',
              },
              nextSupportActions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Gợi ý bước hỗ trợ tiếp theo cho giáo viên/phụ huynh.',
              },
              disclaimer: {
                type: Type.STRING,
                description: 'Lời nhắc rõ đây là gợi ý tham khảo, không phải kết luận chính thức.',
              },
            },
            required: [
              'summary',
              'strengths',
              'supportNeeds',
              'dataGapsOrConflicts',
              'suggestedComments',
              'nextSupportActions',
              'disclaimer',
            ],
          },
        },
      });

      const rawJson = response.text?.trim();
      if (!rawJson) {
        res.status(502).json({
          error: 'Trợ lý AI không trả về dữ liệu phân tích hợp lệ.',
        });
        return;
      }

      const parsed = JSON.parse(rawJson) as {
        summary?: string;
        strengths?: string[];
        supportNeeds?: string[];
        dataGapsOrConflicts?: string[];
        suggestedComments?: string[];
        nextSupportActions?: string[];
        disclaimer?: string;
      };

      res.json({
        analysis: {
          summary: parsed.summary || '',
          strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
          supportNeeds: Array.isArray(parsed.supportNeeds) ? parsed.supportNeeds : [],
          dataGapsOrConflicts: Array.isArray(parsed.dataGapsOrConflicts) ? parsed.dataGapsOrConflicts : [],
          suggestedComments: Array.isArray(parsed.suggestedComments) ? parsed.suggestedComments : [],
          nextSupportActions: Array.isArray(parsed.nextSupportActions) ? parsed.nextSupportActions : [],
          disclaimer:
            parsed.disclaimer ||
            'Đây là gợi ý từ Trợ lý AI, không phải kết luận chính thức. Giáo viên cần xem, sửa và xác nhận trước khi lưu.',
        },
        model: 'gemini-4-hydrogen',
        generatedAt: new Date().toISOString(),
        isAdvisoryOnly: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Lỗi không xác định khi phân tích dữ liệu với Trợ lý AI.';
      const statusCode =
        message.includes('GEMINI_API_KEY') ? 503 :
        message.includes('PERMISSION_DENIED') || message.includes('API_KEY_INVALID') ? 403 :
        message.includes('RESOURCE_EXHAUSTED') ? 429 : 500;

      res.status(statusCode).json({
        error: message,
      });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server: httpServer },
        ws: { server: httpServer },
        watch: disableHmr ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Chưa có bản build sản phẩm (dist/index.html).');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`HOATAM Student Assessment server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
