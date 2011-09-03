<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.1" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:nsp="namespace_declaration" xmlns:rng="http://relaxng.org/ns/structure/1.0" exclude-result-prefixes="rng">

<xsl:output method="xml"/>

<!-- 7.11
The QName (qualified name) used in name elements is replaced by their local part. The ns attribute of these elements is replaced by the namespace URI defined for their prefix.
 -->

<xsl:template match="*|text()|@*">
	<xsl:copy>
		<xsl:apply-templates select="@*"/>
		<xsl:apply-templates/>
	</xsl:copy>
</xsl:template>

<xsl:template match="rng:name[contains(., ':')]">
	<xsl:variable name="prefix" select="substring-before(., ':')"/>
	<rng:name>
		<xsl:attribute name="ns">
			<xsl:for-each select="ancestor-or-self::*[nsp:namespace]/nsp:namespace">
				 <xsl:if test="current()/@prefix = $prefix">
	                <xsl:value-of select="current()/@uri"/>
	            </xsl:if>
			</xsl:for-each>
		</xsl:attribute>
		<xsl:value-of select="substring-after(., ':')"/>
	</rng:name>
</xsl:template>

</xsl:stylesheet>
