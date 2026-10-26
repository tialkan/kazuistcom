import { beforeEach, expect, it, vi } from 'vitest';

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }));
import { smtpTransport } from '../transports.ts';

beforeEach(() => sendMail.mockReset());

it('forwards PDF bytes and the stable message ID and returns a provider acceptance receipt', async () => {
  sendMail.mockResolvedValue({
    messageId: 'provider-message',
    accepted: ['test@example.invalid'],
    rejected: [],
  });
  const receipt = await smtpTransport('smtp://test.invalid').send({
    to: 'test@example.invalid',
    subject: 'Test',
    text: 'Test document',
    messageId: '<legal-test@kazuist.com>',
    attachments: [
      {
        filename: 'contract.pdf',
        content: new Uint8Array([37, 80, 68, 70, 45]),
        contentType: 'application/pdf',
      },
    ],
  });
  expect(receipt).toEqual({ messageId: 'provider-message' });
  expect(sendMail).toHaveBeenCalledWith(
    expect.objectContaining({
      messageId: '<legal-test@kazuist.com>',
      attachments: [
        { filename: 'contract.pdf', content: Buffer.from('%PDF-'), contentType: 'application/pdf' },
      ],
    }),
  );
});

it.each([
  { messageId: 'provider-message', accepted: [], rejected: ['test@example.invalid'] },
  { messageId: 'provider-message', accepted: [], rejected: [] },
  { messageId: '', accepted: ['test@example.invalid'], rejected: [] },
])('does not return a receipt without provider acceptance and an ID', async (result) => {
  sendMail.mockResolvedValue(result);
  await expect(
    smtpTransport('smtp://test.invalid').send({
      to: 'test@example.invalid',
      subject: 'Test',
      text: 'Test document',
    }),
  ).rejects.toThrow('did not accept');
});
