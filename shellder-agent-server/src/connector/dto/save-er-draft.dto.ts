import { IsObject } from 'class-validator';
import { ErDiagram } from '../connector-schema.types';

export class SaveErDraftDto {
  @IsObject()
  diagram!: ErDiagram;
}
