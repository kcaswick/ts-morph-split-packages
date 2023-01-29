import * as fs from "fs-extra";

export type IConfigJson = {
  OldPatterns: Record<string, Location>;
};

export type ILocation = {
  Repo: string;
  Package: string;
  Path: string;
  Order?: number;
};

class Location implements ILocation {
  Repo: string;
  Package: string;
  Path: string;
  Order?: number | undefined;
  /**
   *
   */
  constructor(source: ILocation) {
    this.Repo = source.Repo ?? "";
    this.Package = source.Package ?? "";
    this.Path = source.Path ?? "";
    this.Order = source.Order ?? 0;
  }

  public toString = () =>
    `${this.Package === this.Repo ? "" : `"${this.Package}"`}${this.Repo}:${this.Path}`;
}

export type IMapResult = {
  OldName: string;
  New?: Location;
};

class MapResult implements IMapResult {
  OldName: string;
  New?: Location;

  /**
   *
   */
  constructor(source: IMapResult) {
    this.OldName = source.OldName;
    this.New = source.New;
  }

  public isUnmapped = () => this.New === undefined;

  public toString = () => `${this.OldName}${this.isUnmapped() ? " (unmapped)" : ` => ${this.New}`}`;
}

export class Config {
  OldPatterns = new Map<string, Location>();
}

// TODO: Switch to using this class for mappings
export class Dependency {
  Name: MapResult;
  dependencyMap: MapResult[] = [];
  /**
   *
   */
  constructor({
    Name,
    dependencyMap: dependencies,
  }: {
    Name: MapResult;
    dependencyMap: MapResult[];
  }) {
    this.Name = Name;
    this.dependencyMap = dependencies;
  }

  public toString = (): string =>
    `${this.Name} has ${
      this.dependencyMap.length > 0 ? this.dependencyMap.length : "no "
    }dependencies [${this.dependencyMap.map((d) => d.toString()).join(", ")}]`;
}

export class PackageMapping {
  config = new Config();
  depMap: {
    Name: MapResult;
    dependencyMap: MapResult[];
  }[] = [];

  invdepMap: {
    Name: MapResult;
    dependentMap: MapResult[];
  }[] = [];

  public Export() {
    // TODO: Export to JSON
  }

  public inverseDependencies(dependencyList: Record<string, string[]>) {
    const dependents: Record<string, string[]> = {};
    Object.entries(dependencyList).forEach((p) => {
      p[1].forEach((_: string | number) => {
        dependents[_] ??= [];
        dependents[_].push(p[0]);
      });
    });
    return dependents;
  }

  public mapPackage(oldPath: string): Location | undefined {
    for (const oldPattern of this.config.OldPatterns.keys()) {
      let target: ILocation | undefined;
      if (
        new RegExp(oldPattern).test(oldPath) &&
        (target = this.config.OldPatterns.get(oldPattern))
      ) {
        const nw: Location = new Location(target);
        nw.Path = oldPath.replace(oldPattern, nw.Path ?? "");
        return nw;
      }
    }

    return undefined;
  }

  public getPackageMap(
    dependencyJsonPath = "doc/dependency.json",
    configPath = "./PackageMap.json"
  ) {
    const packageMap: IConfigJson = fs.readJsonSync(configPath);
    const dep2: Record<string, string[]> = fs.readJsonSync(dependencyJsonPath);

    const dependents = this.inverseDependencies(dep2);

    Object.entries(packageMap.OldPatterns)
      .sort((a, b) => (a[1].Order ?? 0) - (b[1].Order ?? 0))
      .forEach((x) => this.config.OldPatterns.set(...x));

    this.depMap = Object.entries(dep2).map((x) => ({
      Name: new MapResult({ OldName: x[0], New: this.mapPackage(x[0]) }),
      dependencyMap: x[1].map((y) => new MapResult({ OldName: y, New: this.mapPackage(y) })),
    }));

    this.invdepMap = Object.entries(dependents).map((x) => ({
      Name: new MapResult({ OldName: x[0], New: this.mapPackage(x[0]) }),
      dependentMap: x[1].map((y) => new MapResult({ OldName: y, New: this.mapPackage(y) })),
    }));

    return this;
  }
}
