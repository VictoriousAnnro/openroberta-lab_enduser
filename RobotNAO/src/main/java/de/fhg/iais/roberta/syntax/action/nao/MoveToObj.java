//newmethod
package de.fhg.iais.roberta.syntax.action.nao;
import de.fhg.iais.roberta.syntax.action.Action;
import de.fhg.iais.roberta.transformer.forClass.NepoPhrase;
import de.fhg.iais.roberta.transformer.forField.NepoField;
import de.fhg.iais.roberta.util.ast.BlocklyProperties;
import de.fhg.iais.roberta.util.syntax.BlocklyConstants;

@NepoPhrase(name = "MOVE_TO_OBJ", category = "ACTOR", blocklyNames = {"naoActions_moveToObject"})
public final class MoveToObj extends Action {
    @NepoField(name = "OBJECT",value = BlocklyConstants.TEXT)
    public final String objectName;

    public MoveToObj(BlocklyProperties properties, String objectName) {
        super(properties);
        this.objectName = objectName;
        setReadOnly();
    }
}