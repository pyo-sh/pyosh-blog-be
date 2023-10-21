import { Column, Entity, PrimaryColumn } from "typeorm";
import { SessionEntity as SessionTypeormEntity } from "typeorm-store";

@Entity("session_tb")
export class SessionEntity implements SessionTypeormEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  expiresAt: number;

  @Column()
  data: string;
}
