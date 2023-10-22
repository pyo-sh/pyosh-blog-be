import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from "typeorm";
import { PostEntity } from "@src/entities/post.entity";
import { UserEntity } from "@src/entities/user.entity";

@Entity("post_comment_tb")
export class PostCommentEntity {
  @PrimaryGeneratedColumn({ type: "int" })
  id: number;

  @Column({ type: "text" })
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @Column({ type: "int" })
  postId: number;

  @ManyToOne(() => PostEntity, (post) => post.comments, {
    cascade: true,
    onDelete: "CASCADE",
  })
  post?: PostEntity;

  @Column({ type: "int" })
  userId: number;

  @ManyToOne(() => UserEntity, (user) => user.postComments, {
    cascade: true,
    onDelete: "CASCADE",
  })
  user?: UserEntity;
}
