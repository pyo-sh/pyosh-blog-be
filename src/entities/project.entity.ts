import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from "typeorm";
import envs from "@src/constants/env";
import { NodeEnv } from "@src/constants/node-env";
import { ImageEntity } from "@src/entities/image.entity";

@Entity("project_tb")
export class ProjectEntity {
  @PrimaryGeneratedColumn({ type: "int" })
  id: number;

  @Column({ type: envs.NODE_ENV === NodeEnv.TEST ? "text" : "longtext" })
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @Column({ type: "int", nullable: true, default: null })
  thumbnailId: number | null;

  @ManyToOne(() => ImageEntity, (image) => image.projects, {
    nullable: true,
    cascade: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "thumbnail_id" })
  thumbnail?: ImageEntity;
}
