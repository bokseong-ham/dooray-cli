import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../config/types.js";

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport },
}));

const config: Config = {
  version: 1,
  apiKey: "api-key",
  baseUrl: "https://api.dooray.com",
  imapUsername: "user@example.com",
  imapPassword: "secret",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
  mocks.sendMail.mockResolvedValue({ messageId: "<m@example.com>", accepted: [], rejected: [] });
});

describe("sendMail attachments", () => {
  it("filename 과 path 만 nodemailer attachments 로 넘긴다", async () => {
    const { sendMail } = await import("./smtpClient.js");
    await sendMail(config, {
      to: ["a@example.com"],
      subject: "s",
      body: "b",
      attachments: [{ filename: "사진.jpg", path: "/tmp/사진.jpg", size: 1 } as never],
    });
    expect(mocks.sendMail.mock.calls[0][0].attachments).toEqual([
      { filename: "사진.jpg", path: "/tmp/사진.jpg" },
    ]);
  });

  it("첨부가 없으면 attachments 키를 만들지 않는다", async () => {
    const { sendMail } = await import("./smtpClient.js");
    await sendMail(config, { to: ["a@example.com"], subject: "s", body: "b" });
    expect(mocks.sendMail.mock.calls[0][0]).not.toHaveProperty("attachments");
  });
});
