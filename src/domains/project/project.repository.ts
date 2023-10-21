import { Repository } from "typeorm";
import { AutoRepository } from "@src/core";
import { ProjectEntity } from "@src/entities/project.entity";

@AutoRepository(ProjectEntity)
class ProjectRepository extends Repository<ProjectEntity> {}

export default ProjectRepository;
