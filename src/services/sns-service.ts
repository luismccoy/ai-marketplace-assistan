import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

export class SNSService {
    private snsClient: SNSClient;
    private topicArn: string;

    constructor() {
        this.snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
        this.topicArn = process.env.SNS_TOPIC_ARN || '';
    }

    async publishNotification(message: string, subject: string): Promise<boolean> {
        if (!this.topicArn) {
            console.warn('SNS_TOPIC_ARN not set. Notification skipped.');
            return false;
        }

        try {
            const command = new PublishCommand({
                TopicArn: this.topicArn,
                Message: message,
                Subject: subject,
            });

            const response = await this.snsClient.send(command);
            console.log('SNS Notification sent:', response.MessageId);
            return true;
        } catch (error) {
            console.error('Error sending SNS notification:', error);
            return false;
        }
    }
}

export const snsService = new SNSService();
