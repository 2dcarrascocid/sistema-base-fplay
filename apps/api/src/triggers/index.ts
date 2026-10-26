import type {
  CustomMessageTriggerEvent,
  PostAuthenticationTriggerEvent,
  PreAuthenticationTriggerEvent,
  PreSignUpTriggerEvent,
} from 'aws-lambda';
import { getDeps } from '../lib/aws/deps.js';
import { postAuthentication, preAuthentication } from './authentication.js';
import { customMessage } from './custom-message.js';
import { preSignUp } from './pre-sign-up.js';

export const preSignUpHandler = async (event: PreSignUpTriggerEvent) => preSignUp(await getDeps(), event);
export const preAuthenticationHandler = async (event: PreAuthenticationTriggerEvent) => preAuthentication(await getDeps(), event);
export const postAuthenticationHandler = async (event: PostAuthenticationTriggerEvent) => postAuthentication(await getDeps(), event);
export const customMessageHandler = async (event: CustomMessageTriggerEvent) => customMessage(await getDeps(), event);
