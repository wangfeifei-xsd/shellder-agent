import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum ReviewAction {
  approve = 'approve',
  reject = 'reject',
}

export class ReviewApprovalDto {
  @IsEnum(ReviewAction)
  action: ReviewAction;

  @IsOptional()
  @IsString()
  opinion?: string;
}
