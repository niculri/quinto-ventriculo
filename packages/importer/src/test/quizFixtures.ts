// What the tests of the quiz converter share: the assessment they belong to and an image processor that keeps what it
// was given.
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { Assessment } from '@qv/schema';
import type { QuizImageProcessor } from '../quizzes/figures';
import type { ProcessedImage } from '../media/images';

export const ASSESSMENT: Assessment = {
  id: 'biologia-celular/certamen-2',
  courseId: 'biologia-celular',
  name: 'Certamen 2',
  position: 2,
};

export function recordingProcessor() {
  const inputs = new Map<string, Buffer>();
  const process: QuizImageProcessor = async (data) => {
    const digest = createHash('sha256').update(data).digest('hex').slice(0, 32);
    const meta = await sharp(data).metadata();
    const key = `tests/${digest}.webp`;
    inputs.set(key, Buffer.from(data));
    return {
      key,
      width: meta.width,
      height: meta.height,
      contentType: 'image/webp',
      read: async () => Buffer.from(data),
    } satisfies ProcessedImage;
  };
  return { process, inputs };
}
