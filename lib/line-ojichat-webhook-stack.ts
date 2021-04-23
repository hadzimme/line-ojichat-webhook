import * as apigateway from "@aws-cdk/aws-apigateway";
import * as lambda from "@aws-cdk/aws-lambda";
import * as cdk from "@aws-cdk/core";
import * as path from "path";

export class LineOjichatWebhookStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const ojichatFunction = new lambda.Function(this, "OjichatFunction", {
      runtime: lambda.Runtime.GO_1_X,
      code: lambda.Code.fromAsset("handlers/talk-to-ojisan", {
        assetHashType: cdk.AssetHashType.OUTPUT,
        bundling: {
          image: lambda.Runtime.GO_1_X.bundlingImage,
          command: [
            "bash",
            "-c",
            "GOOS=linux GOARCH=amd64 go build -o /asset-output/main",
          ],
          user: "root",
        },
      }),
      handler: "main",
    });
    const layerVersion = new lambda.LayerVersion(this, "LayerVersion", {
      code: lambda.Code.fromAsset("bundle", {
        assetHashType: cdk.AssetHashType.OUTPUT,
        bundling: {
          image: lambda.Runtime.NODEJS_14_X.bundlingImage,
          command: [
            "bash",
            "-c",
            [
              "npm -g install npm",
              "mkdir -p /asset-output/nodejs",
              "cp package.json package-lock.json /asset-output/nodejs",
              "npm install --prefix /asset-output/nodejs",
            ].join(" && "),
          ],
          user: "root",
        },
      }),
    });
    const channelSecret = cdk.SecretValue.secretsManager(
      "LineMessagingApiChannelSecret"
    );
    const channelAccessToken = cdk.SecretValue.secretsManager(
      "LineMessagingApiChannelAccessToken"
    );
    const { region } = cdk.Stack.of(this);
    const webhookFunction = new lambda.Function(this, "WebhookFunction", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset(path.resolve(__dirname, ".."), {
        assetHashType: cdk.AssetHashType.OUTPUT,
        bundling: {
          image: lambda.Runtime.NODEJS_14_X.bundlingImage,
          command: [
            "bash",
            "-c",
            [
              "npm -g install npm",
              "cp -au handlers tsconfig.json package.json package-lock.json /tmp",
              "cd /tmp",
              "npm install",
              "npx tsc --outDir /asset-output",
            ].join(" && "),
          ],
          user: "root",
        },
      }),
      handler: "main.handle",
      layers: [layerVersion],
      environment: {
        OJICHAT_FUNCTION_NAME: ojichatFunction.functionName,
        CHANNEL_SECRET: channelSecret.toString(),
        CHANNEL_ACCESS_TOKEN: channelAccessToken.toString(),
        REGION: region,
      },
    });
    ojichatFunction.grantInvoke(webhookFunction);
    const api = new apigateway.RestApi(this, "RestApi", { deploy: false });
    const requestModel = api.addModel("LineMessagingApiWebhookRequestModel", {
      contentType: "application/json",
      modelName: "LineMessagingApiWebhookRequestModel",
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT4,
        title: "LINE Messaging API Webhook Request",
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          destination: { type: apigateway.JsonSchemaType.STRING },
          events: {
            type: apigateway.JsonSchemaType.ARRAY,
            items: { type: apigateway.JsonSchemaType.OBJECT },
          },
        },
      },
    });
    const resource = api.root.addResource("webhook");
    const lambdaIntegration = new apigateway.LambdaIntegration(
      webhookFunction,
      {
        proxy: false,
        requestParameters: {
          "integration.request.header.x-line-signature":
            "method.request.header.x-line-signature",
        },
        allowTestInvoke: true,
        requestTemplates: {
          "application/json": `{${[
            '"body":"$util.escapeJavaScript($input.body)"',
            '"signature":"$input.params(\'x-line-signature\')"',
            "\"events\":$input.path('$.events')",
          ].join(",")}}`,
        },
        passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
        integrationResponses: [{ statusCode: "200" }],
      }
    );
    const method = resource.addMethod("POST", lambdaIntegration, {
      requestParameters: {
        "method.request.header.x-line-signature": false,
      },
      requestModels: {
        "application/json": requestModel,
      },
      methodResponses: [{ statusCode: "200" }],
    });
    const deployment = new apigateway.Deployment(this, "Deployment", { api });
    deployment.node.addDependency(method);
    new apigateway.Stage(this, "Stage", {
      deployment,
      stageName: "v1",
    });
  }
}
