namespace LinhaZero.Tests;

public class IncidentsTests
{
    // Real response recorded 2026-10-17 13:26 UTC: 8 rural fires, none in Guimarães.
    private static readonly Snapshot<FogosActiveFile> Fogos = Fixtures.Load<FogosActiveFile>("fogos-active");
    private static readonly BoundingBox GuimaraesGrid = new(-8.38, 41.38, -8.20, 41.52);

    [Fact]
    public void Real_fixture_is_normalised_and_filtered_by_bbox()
    {
        Assert.Equal(8, IncidentParser.Parse(Fogos.Data!, new BoundingBox(-10, 36.5, -6, 42.5)).Count);
        Assert.Empty(IncidentParser.Parse(Fogos.Data!, GuimaraesGrid));

        var mafra = Assert.Single(IncidentParser.Parse(Fogos.Data!, new BoundingBox(-9.5, 38.9, -9.2, 39.1)));
        Assert.Equal("20261476150", mafra.Id);
        Assert.Equal("Lisboa, Mafra, Santo Isidoro", mafra.Place);
        Assert.Equal("Conclusão", mafra.Status);
        Assert.Equal("Mato", mafra.Nature);
        Assert.Equal(new IncidentResources(6, 2, 0), mafra.Resources);
        Assert.Equal(DateTimeOffset.FromUnixTimeSeconds(1792233060).UtcDateTime, mafra.StartedAt);
        Assert.Equal(DateTimeKind.Utc, mafra.StartedAt!.Value.Kind);
    }

    [Fact]
    public void Non_fire_incidents_are_dropped()
    {
        var file = FogosActiveFile.Parse("""
            {"success":true,"data":[
              {"id":"a","lat":41.4,"lng":-8.3,"location":"x","status":"Em Curso","natureza":"Habitacional","isFire":false,"man":1,"terrain":1,"aerial":0},
              {"id":"b","lat":41.4,"lng":-8.3,"location":"y","status":"Em Curso","natureza":"Povoamento Florestal","man":1,"terrain":1,"aerial":0,"date":"17-10-2026","hour":"11:31"}]}
            """);
        var only = Assert.Single(IncidentParser.Parse(file, GuimaraesGrid));
        Assert.Equal("b", only.Id);
        Assert.Equal(new DateTime(2026, 10, 17, 10, 31, 0, DateTimeKind.Utc), only.StartedAt); // 11:31 Lisbon summer time
    }

    [Fact]
    public void Loose_fields_are_read_leniently()
    {
        // Numbers as strings, a numeric id, the bare-array form, and a field of the wrong type.
        var file = FogosActiveFile.Parse("""
            [{"id":123,"lat":"41.4","lng":"-8.3","concelho":"Guimarães","freguesia":"Penha","natureza":"Mato","man":"4","isFire":"yes"}]
            """);
        var only = Assert.Single(IncidentParser.Parse(file, GuimaraesGrid));
        Assert.Equal("123", only.Id);
        Assert.Equal("Guimarães, Penha", only.Place);
        Assert.Equal(4, only.Resources.People);
        Assert.Null(only.StartedAt);
    }

    [Fact]
    public void Missing_body_gives_empty_list_with_the_error()
    {
        var answer = IncidentParser.Build(Snapshot<FogosActiveFile>.Unavailable("HTTP 429"), GuimaraesGrid);
        Assert.Empty(answer.Incidents);
        Assert.Equal("HTTP 429", answer.Source.Error);
        Assert.True(answer.Source.Stale);
    }
}
