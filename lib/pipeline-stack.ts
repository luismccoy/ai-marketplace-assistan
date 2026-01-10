
import * as cdk from 'aws-cdk-lib';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';

export interface AIMarketplacePipelineStackProps extends cdk.StackProps {
    githubOwner: string;
    githubRepo: string;
    githubBranch: string;
    githubConnectionArn?: string;
}

export class AIMarketplacePipelineStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: AIMarketplacePipelineStackProps) {
        super(scope, id, props);

        const { githubOwner, githubRepo, githubBranch, githubConnectionArn } = props;

        // Use CodeStar connection if provided, otherwise assume standard GitHub source (which might require token)
        // For modern CDK pipelines, config is usually essential. 
        // Defaulting to CodePipelineSource.connection (GitHub v2) if ARN exists, else maybe public repo? 
        // Assuming ARN is standard for this user setup based on previous context.

        let input: pipelines.CodePipelineSource;

        if (githubConnectionArn) {
            input = pipelines.CodePipelineSource.connection(`${githubOwner}/${githubRepo}`, githubBranch, {
                connectionArn: githubConnectionArn,
            });
        } else {
            // Fallback or placeholder - but likely will fail without auth. 
            // We'll trust the user context will provide the ARN or this is a placeholder.
            input = pipelines.CodePipelineSource.gitHub(`${githubOwner}/${githubRepo}`, githubBranch);
        }

        const pipeline = new pipelines.CodePipeline(this, 'Pipeline', {
            pipelineName: 'AIMarketplacePipeline',
            synth: new pipelines.ShellStep('Synth', {
                input,
                commands: [
                    'npm ci',
                    'npm run build',
                    'npx cdk synth',
                ],
            }),
        });

        // Add stages here if there were any Application Stages defined.
        // Since we are just recovering files, we'll leave it as a base pipeline.
    }
}
