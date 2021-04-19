import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as LineOjichatWebhook from '../lib/line-ojichat-webhook-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new LineOjichatWebhook.LineOjichatWebhookStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
