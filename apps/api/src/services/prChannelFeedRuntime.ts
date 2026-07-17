import {
  getChannelNotification,
  insertChannelNotification,
  updateChannelNotificationStatus
} from './channelNotifications.js';
import { createPrChannelFeed } from './prChannelFeed.js';
import { postPrChannelNotification, updatePrChannelNotification } from './slack.js';

export const prChannelFeed = createPrChannelFeed({
  getNotification: getChannelNotification,
  insertNotification: insertChannelNotification,
  updateNotificationStatus: updateChannelNotificationStatus,
  postNotification: postPrChannelNotification,
  updateNotification: updatePrChannelNotification
});
