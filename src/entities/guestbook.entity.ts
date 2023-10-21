import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from "typeorm";
import { UserEntity } from "@src/entities/user.entity";

@Entity("guestbook_tb")
export class GuestbookEntity {
  @PrimaryGeneratedColumn({ type: "int" })
  id: number;

  @Column({ type: "text" })
  comment: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @Column({ type: "int" })
  userId: number;

  @ManyToOne(() => UserEntity, (user) => user.guestbooks, {
    cascade: true,
    onDelete: "CASCADE",
  })
  user?: UserEntity;
}
