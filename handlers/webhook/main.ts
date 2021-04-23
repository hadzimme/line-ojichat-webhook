import * as lambda from "@aws-sdk/client-lambda";
import * as line from "@line/bot-sdk";
import * as crypto from "crypto";
import * as util from "util";

interface SourceUser {
  type: "user";
  userId: string;
}

interface OtherSource {
  type: "other";
}

type Source = SourceUser | OtherSource;

interface MessageEvent {
  type: "message";
  source: Source;
  replyToken: string;
}

interface OtherEvent {
  type: "other";
}

type WebhookEvent = MessageEvent | OtherEvent;

interface Event {
  body: string;
  signature: string;
  events: WebhookEvent[];
}

const channelSecret = process.env.CHANNEL_SECRET;
if (!channelSecret) {
  throw new Error("Environment variable not set: CHANNEL_SECRET");
}
const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN;
if (!channelAccessToken) {
  throw new Error("Environment variable not set: CHANNEL_ACCESS_TOKEN");
}
const lineClient = new line.Client({ channelAccessToken });
const ojichatFunctionName = process.env.OJICHAT_FUNCTION_NAME;
if (!ojichatFunctionName) {
  throw new Error("Environment variable not set: OJICHAT_FUNCTION_NAME");
}
const region = process.env.REGION;
if (!region) {
  throw new Error("Environment variable not set: REGION");
}
const lambdaClient = new lambda.LambdaClient({ region });

export const handle = async (event: Event) => {
  console.log(event);
  const signature = crypto
    .createHmac("SHA256", channelSecret)
    .update(event.body)
    .digest("base64");
  if (signature !== event.signature) {
    console.log({ message: "Bad Signature:", event });
    return;
  }
  for (const webhookEvent of event.events) {
    if (webhookEvent.type !== "message") {
      console.log({
        message: "The event type is not a message event",
        webhookEvent,
      });
      continue;
    }
    if (webhookEvent.source.type !== "user") {
      console.log({
        message: "The source type is not a user source",
        source: webhookEvent.source,
      });
      continue;
    }
    const profile = await lineClient.getProfile(webhookEvent.source.userId);
    const command = new lambda.InvokeCommand({
      FunctionName: ojichatFunctionName,
      Payload: new util.TextEncoder().encode(
        JSON.stringify({
          targetName: profile.displayName,
          emojiNum: 4,
          punctuationLevel: 0,
        })
      ),
    });
    const { Payload: payload } = await lambdaClient.send(command);
    if (!payload) {
      console.log("Ojisan does not respond.");
      continue;
    }
    const output = JSON.parse(new util.TextDecoder("utf-8").decode(payload));
    await lineClient.replyMessage(webhookEvent.replyToken, {
      type: "text",
      text: output.message,
    });
  }
};
