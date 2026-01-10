
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

export interface AdminDashboardStackProps extends cdk.StackProps {
    environment?: string;
}

export class AdminDashboardStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: AdminDashboardStackProps) {
        super(scope, id, props);

        // Apply global tags
        cdk.Tags.of(this).add('App', 'ai-marketplace-assistant');
        cdk.Tags.of(this).add('AutoDelete', 'No');

        const environment = props?.environment || 'production';

        // 1. Create Private S3 Bucket
        const websiteBucket = new s3.Bucket(this, 'AdminDashboardBucket', {
            bucketName: `ai-admin-dash-${environment}-${this.account}-v2`,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            versioned: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            autoDeleteObjects: false,
        });

        // 2. Create CloudFront Origin Access Identity (OAI) - Legacy but reliable
        // Note: The YAML used OAC, but OAI is often simpler for quick CDK restoration. 
        // Given the YAML context, let's try to match OAI/OAC as best as possible.
        // CDK L2 constructs favor OAI by default for S3Origin, but we can explicit.

        const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI', {
            comment: `OAI for AI Marketplace Admin Dashboard - ${environment}`,
        });

        // Grant read access to OAI
        websiteBucket.grantRead(originAccessIdentity);

        // 3. Create CloudFront Distribution
        const distribution = new cloudfront.Distribution(this, 'AdminDashboardDistribution', {
            comment: `AI Marketplace Admin Dashboard - ${environment}`,
            defaultBehavior: {
                origin: new origins.S3Origin(websiteBucket, {
                    originAccessIdentity: originAccessIdentity,
                }),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                compress: true,
            },
            defaultRootObject: 'index.html',
            errorResponses: [
                {
                    httpStatus: 403,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                    ttl: cdk.Duration.minutes(5),
                },
                {
                    httpStatus: 404,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                    ttl: cdk.Duration.minutes(5),
                },
            ],
            priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
            enableLogging: false,
        });

        // Outputs
        new cdk.CfnOutput(this, 'AdminDashboardURL', {
            value: `https://${distribution.distributionDomainName}`,
            description: 'Admin Dashboard CloudFront URL (Secure)',
        });

        new cdk.CfnOutput(this, 'AdminDashboardBucketName', {
            value: websiteBucket.bucketName,
            description: 'Private S3 bucket for admin dashboard',
        });

        new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
            value: distribution.distributionId,
            description: 'CloudFront Distribution ID',
        });
    }
}
