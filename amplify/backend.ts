import { defineBackend} from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';

const amplifyBackend = defineBackend({
  auth,
  data,
});

const livenessStack = amplifyBackend.createStack("liveness-stack");

const livenessPolicy = new Policy(livenessStack, "LivenessPolicy", {
  statements: [
    new PolicyStatement({
      actions: [
        "rekognition:StartFaceLivenessSession",
        "rekognition:CreateFaceLivenessSession",
        "rekognition:GetFaceLivenessSessionResults"
      ],
      resources: [`arn:aws:rekognition:${livenessStack.region}:${livenessStack.account}:*`],
    }),
  ],
});

// Ensure roles exist before attaching policies
const authResources = amplifyBackend.auth.resources;
if (authResources.unauthenticatedUserIamRole) {
  authResources.unauthenticatedUserIamRole.attachInlinePolicy(livenessPolicy);
}
if (authResources.authenticatedUserIamRole) {
  authResources.authenticatedUserIamRole.attachInlinePolicy(livenessPolicy);
}